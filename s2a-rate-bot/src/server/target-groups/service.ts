import { z } from "zod";
import { TARGET_RULE_VERSION } from "../../core/rule-version.ts";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { resolveRateUpdate } from "../../core/rate-rule.ts";
import type { TargetGroupStore, TargetRuleUpdate } from "./store.ts";
import type { RuleParameters, SourceBinding, TargetGroup, TargetGroupClient, TargetRule } from "./types.ts";
import { ruleParametersSchema } from "./rule-parameters.ts";

const STALE_SOURCE_BINDING_ERROR = "已删除的采集源分组已自动取消绑定";
const SOURCE_BINDING_REMOVED_ERROR = "采集源分组取消关联，倍率规则已自动停用";
const bindingSchema = z.object({ sourceSiteId: z.number().int().positive(), sourceGroupId: z.string().trim().min(1) });
const sourceBindingsSchema = bindingSchema.extend({ targetGroupIds: z.array(z.number().int().positive()) });
export const targetRuleSchema = z.object({
  enabled: z.boolean(),
  ruleVersion: z.number().int().refine((value) => value === TARGET_RULE_VERSION, "不支持的倍率规则版本"),
  ruleType: z.enum(["first", "average", "min", "max", "avg_formula"]),
  parameters: ruleParametersSchema,
  bindings: z.array(bindingSchema),
}).superRefine((value, context) => {
  if (value.enabled && value.bindings.length === 0) context.addIssue({ code: "custom", message: "启用规则时至少绑定一个采集源分组" });
});

export type TargetGroupView = TargetGroup & {
  readonly rule: TargetRule;
  readonly bindings: readonly SourceBinding[];
};

export type TargetGroupService = {
  readonly list: () => Promise<TargetGroupView[]>;
  readonly refreshAll: () => Promise<TargetGroupView[]>;
  readonly refresh: (groupId: number) => Promise<TargetGroupView | null>;
  readonly saveRule: (groupId: number, input: unknown) => Promise<TargetGroupView>;
  readonly saveSourceBindings: (input: unknown) => Promise<TargetGroupView[]>;
  readonly preview: (groupId: number) => Promise<ReturnType<typeof resolveRateUpdate>>;
  readonly apply: (groupId: number) => Promise<ReturnType<typeof resolveRateUpdate>>;
};

export function createTargetGroupService(input: {
  readonly store: TargetGroupStore;
  readonly client: TargetGroupClient;
  readonly sourceRates: () => Promise<readonly SourceRateSnapshot[]>;
}): TargetGroupService {
  return {
    list: () => listGroups(input),
    refreshAll: () => refreshAllGroups(input),
    refresh: (groupId) => refreshGroup(input, groupId),
    saveRule: (groupId, raw) => saveRule(input, groupId, raw),
    saveSourceBindings: (raw) => saveSourceBindings(input, raw),
    preview: (groupId) => previewRule(input, groupId),
    apply: (groupId) => applyRule(input, groupId),
  };
}

async function listGroups(input: TargetDependencies) {
  return Promise.all((await input.store.listGroups()).map((group) => groupView(input.store, group)));
}

async function refreshAllGroups(input: TargetDependencies) {
  await input.store.replaceGroups(await input.client.listGroups());
  return listGroups(input);
}

async function refreshGroup(input: TargetDependencies, groupId: number) {
  const group = await remoteGroup(input.client, groupId);
  if (!group) {
    await input.store.removeGroup(groupId);
    return null;
  }
  await input.store.saveGroup(group);
  return groupView(input.store, group);
}

async function saveRule(input: TargetDependencies, groupId: number, raw: unknown) {
  const parsed = targetRuleSchema.parse(raw);
  const group = await localGroup(input.store, groupId);
  const reconciliation = reconcileBindings(parsed.bindings, await input.sourceRates());
  const previousRule = await input.store.getRule(groupId);
  const rule: TargetRule = {
    targetGroupId: group.id, targetGroupName: group.name,
    enabled: parsed.enabled && reconciliation.bindings.length > 0,
    ruleVersion: parsed.ruleVersion, ruleType: parsed.ruleType, parameters: parsed.parameters,
    currentRate: group.rate_multiplier ?? null,
    lastAppliedFromRate: previousRule?.lastAppliedFromRate ?? null,
    lastAppliedToRate: previousRule?.lastAppliedToRate ?? null,
    lastAppliedAt: previousRule?.lastAppliedAt ?? null,
    lastError: reconciliation.removed ? STALE_SOURCE_BINDING_ERROR : null,
  };
  await input.store.saveRule(rule, reconciliation.bindings);
  return groupView(input.store, group);
}

async function saveSourceBindings(input: TargetDependencies, raw: unknown) {
  const parsed = sourceBindingsSchema.parse(raw);
  const source = (await input.sourceRates()).find((rate) => rate.sourceSiteId === parsed.sourceSiteId && rate.groupId === parsed.sourceGroupId);
  if (!source) throw new Error(`采集分组不存在: ${bindingKey(parsed)}`);
  const groups = await input.store.listGroups();
  const selected = new Set(parsed.targetGroupIds);
  validateTargetSelection(groups, selected, source.groupType ?? source.platform);
  const candidates = await Promise.all(groups
    .map((group) => sourceBindingUpdate(input.store, group, parsed, selected.has(group.id))));
  const updates = candidates
    .filter((update): update is TargetRuleUpdate => update !== null);
  await input.store.saveRules(updates);
  return listGroups(input);
}

async function sourceBindingUpdate(
  store: TargetGroupStore,
  group: TargetGroup,
  source: SourceBinding,
  selected: boolean,
): Promise<TargetRuleUpdate | null> {
  const current = await store.bindings(group.id);
  const hasBinding = current.some((binding) => bindingKey(binding) === bindingKey(source));
  if (selected === hasBinding) return null;
  const bindings = selected ? dedupeBindings([...current, source]) : current.filter((binding) => bindingKey(binding) !== bindingKey(source));
  const rule = await store.getRule(group.id) ?? defaultRule(group);
  const disabled = rule.enabled && bindings.length === 0;
  const priorError = rule.lastError === SOURCE_BINDING_REMOVED_ERROR ? null : rule.lastError;
  return { rule: { ...rule, enabled: disabled ? false : rule.enabled, lastError: disabled ? SOURCE_BINDING_REMOVED_ERROR : priorError }, bindings };
}

function validateTargetSelection(groups: readonly TargetGroup[], selected: ReadonlySet<number>, sourcePlatform?: string) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const missing = [...selected].find((groupId) => !byId.has(groupId));
  if (missing !== undefined) throw new Error(`目标分组不存在: ${missing}`);
  const incompatible = [...selected].map((groupId) => byId.get(groupId)!).find((group) => !samePlatform(group.platform, sourcePlatform));
  if (incompatible) throw new Error(`目标分组平台不匹配: ${incompatible.name}`);
}

function samePlatform(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

async function previewRule(input: TargetDependencies, groupId: number) {
  const group = await localGroup(input.store, groupId);
  const rule = await input.store.getRule(groupId);
  if (!rule) throw new Error("目标分组尚未配置倍率规则");
  const reconciled = await boundRates(input, groupId, rule);
  return resolveRateUpdate({
    target: { id: group.id, name: group.name, currentRate: group.rate_multiplier ?? null },
    rule: { enabled: reconciled.rule.enabled, mode: reconciled.rule.ruleType, ...reconciled.rule.parameters },
    sourceRates: reconciled.rates,
  });
}

async function applyRule(input: TargetDependencies, groupId: number) {
  try {
    const decision = await previewRule(input, groupId);
    if (decision.action === "skip") return decision;
    const updated = await input.client.updateGroupRate(groupId, decision.nextRate);
    await input.store.saveGroup(updated);
    await input.store.recordApplied(groupId, decision.currentRate, updated.rate_multiplier ?? decision.nextRate);
    return decision;
  } catch (error) {
    await input.store.recordError(groupId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function boundRates(input: TargetDependencies, groupId: number, rule: TargetRule) {
  const bindings = await input.store.bindings(groupId);
  const rates = await input.sourceRates();
  const reconciliation = reconcileBindings(bindings, rates);
  const reconciledRule = reconciliation.removed
    ? { ...rule, enabled: rule.enabled && reconciliation.bindings.length > 0, lastError: STALE_SOURCE_BINDING_ERROR }
    : rule;
  if (reconciliation.removed) await input.store.saveRule(reconciledRule, reconciliation.bindings);
  const rateMap = new Map(rates.map((rate) => [`${rate.sourceSiteId}:${rate.groupId}`, rate.effectiveRate]));
  return { rule: reconciledRule, rates: reconciliation.bindings.map((binding) => rateMap.get(bindingKey(binding))!) };
}

async function remoteGroup(client: TargetGroupClient, groupId: number): Promise<TargetGroup | null> {
  const group = (await client.listGroups()).find((item) => item.id === groupId);
  return group ?? null;
}

async function localGroup(store: TargetGroupStore, groupId: number) {
  const group = await store.getGroup(groupId);
  if (!group) throw new Error(`本地目标分组不存在: ${groupId}，请先刷新`);
  return group;
}

async function groupView(store: TargetGroupStore, group: TargetGroup): Promise<TargetGroupView> {
  return { ...group, rule: await store.getRule(group.id) ?? defaultRule(group), bindings: await store.bindings(group.id) };
}

function defaultRule(group: TargetGroup): TargetRule {
  return {
    targetGroupId: group.id, targetGroupName: group.name, enabled: false,
    ruleVersion: TARGET_RULE_VERSION, ruleType: "first", parameters: defaultParameters(),
    currentRate: group.rate_multiplier ?? null, lastAppliedFromRate: null,
    lastAppliedToRate: null, lastAppliedAt: null, lastError: null,
  };
}

function defaultParameters(): RuleParameters {
  return { adjustmentMode: "fixed", adjustmentValue: 0, minimum: 0, formula: "avg" };
}
function reconcileBindings(bindings: readonly SourceBinding[], rates: readonly SourceRateSnapshot[]) {
  const normalized = dedupeBindings(bindings);
  const available = new Set(rates.map((rate) => `${rate.sourceSiteId}:${rate.groupId}`));
  const valid = normalized.filter((binding) => available.has(bindingKey(binding)));
  return { bindings: valid, removed: valid.length !== normalized.length };
}
function dedupeBindings(bindings: readonly SourceBinding[]) { return [...new Map(bindings.map((binding) => [bindingKey(binding), binding])).values()]; }
function bindingKey(value: Pick<SourceBinding, "sourceSiteId" | "sourceGroupId">) { return `${value.sourceSiteId}:${value.sourceGroupId}`; }
type TargetDependencies = Parameters<typeof createTargetGroupService>[0];
