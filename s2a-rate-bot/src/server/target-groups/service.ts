import { z } from "zod";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { resolveRateUpdate } from "../../core/rate-rule.ts";
import type { TargetGroupStore } from "./store.ts";
import type { RuleParameters, SourceBinding, TargetGroup, TargetGroupClient, TargetRule } from "./types.ts";

const parametersSchema = z.object({
  offset: z.number().finite(),
  multiplier: z.number().finite(),
  formula: z.string().trim().min(1),
});
const bindingSchema = z.object({ sourceSiteId: z.number().int().positive(), sourceGroupId: z.string().trim().min(1) });
export const targetRuleSchema = z.object({
  enabled: z.boolean(),
  ruleVersion: z.number().int().refine((value) => value === 1, "不支持的倍率规则版本"),
  ruleType: z.enum(["first", "average", "min", "max", "avg_formula"]),
  parameters: parametersSchema,
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
  readonly saveRule: (groupId: number, input: unknown) => Promise<TargetGroupView>;
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
    saveRule: (groupId, raw) => saveRule(input, groupId, raw),
    preview: (groupId) => previewRule(input, groupId),
    apply: (groupId) => applyRule(input, groupId),
  };
}

async function listGroups(input: TargetDependencies) {
  const groups = await input.client.listGroups();
  return groups.map((group) => groupView(input.store, group));
}

async function saveRule(input: TargetDependencies, groupId: number, raw: unknown) {
  const parsed = targetRuleSchema.parse(raw);
  const group = await remoteGroup(input.client, groupId);
  const rule: TargetRule = {
    targetGroupId: group.id, targetGroupName: group.name, enabled: parsed.enabled,
    ruleVersion: 1, ruleType: parsed.ruleType, parameters: parsed.parameters,
    currentRate: group.rate_multiplier ?? null, lastAppliedAt: input.store.getRule(groupId)?.lastAppliedAt ?? null, lastError: null,
  };
  input.store.saveRule(rule, dedupeBindings(parsed.bindings));
  return groupView(input.store, group);
}

async function previewRule(input: TargetDependencies, groupId: number) {
  const group = await remoteGroup(input.client, groupId);
  const rule = input.store.getRule(groupId);
  if (!rule) throw new Error("目标分组尚未配置倍率规则");
  const sourceRates = await boundRates(input, groupId);
  return resolveRateUpdate({
    target: { id: group.id, name: group.name, currentRate: group.rate_multiplier ?? null },
    rule: { enabled: rule.enabled, mode: rule.ruleType, ...rule.parameters },
    sourceRates,
  });
}

async function applyRule(input: TargetDependencies, groupId: number) {
  try {
    const decision = await previewRule(input, groupId);
    if (decision.action === "skip") return decision;
    const updated = await input.client.updateGroupRate(groupId, decision.nextRate);
    input.store.recordApplied(groupId, updated.rate_multiplier ?? decision.nextRate);
    return decision;
  } catch (error) {
    input.store.recordError(groupId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function boundRates(input: TargetDependencies, groupId: number) {
  const bindings = input.store.bindings(groupId);
  const rates = await input.sourceRates();
  const index = new Map(rates.map((rate) => [`${rate.sourceSiteId}:${rate.groupId}`, rate.effectiveRate]));
  return bindings.map((binding) => {
    const key = `${binding.sourceSiteId}:${binding.sourceGroupId}`;
    const rate = index.get(key);
    if (rate === undefined) throw new Error(`采集源分组不存在: ${key}`);
    return rate;
  });
}

async function remoteGroup(client: TargetGroupClient, groupId: number) {
  const group = (await client.listGroups()).find((item) => item.id === groupId);
  if (!group) throw new Error(`目标分组不存在: ${groupId}`);
  return group;
}

function groupView(store: TargetGroupStore, group: TargetGroup): TargetGroupView {
  return { ...group, rule: store.getRule(group.id) ?? defaultRule(group), bindings: store.bindings(group.id) };
}

function defaultRule(group: TargetGroup): TargetRule {
  return { targetGroupId: group.id, targetGroupName: group.name, enabled: false, ruleVersion: 1, ruleType: "first", parameters: defaultParameters(), currentRate: group.rate_multiplier ?? null, lastAppliedAt: null, lastError: null };
}

function defaultParameters(): RuleParameters { return { offset: 0, multiplier: 1, formula: "avg" }; }
function dedupeBindings(bindings: readonly SourceBinding[]) { return [...new Map(bindings.map((binding) => [`${binding.sourceSiteId}:${binding.sourceGroupId}`, binding])).values()]; }
type TargetDependencies = Parameters<typeof createTargetGroupService>[0];
