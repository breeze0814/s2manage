import { z } from "zod";
import { db } from "@/server/db";
import { resolveBlEffectiveRate, resolveBlRateMultiplier, type BlPublicClient } from "@/server/clients/bl-public";
import { normalizeRateMultiplier } from "@/server/rates";
import {
  groupMonitorRateExclusionsBySource,
  monitorGroupRateExclusionKey,
  readActiveMonitorRateExclusions,
  type MonitorRateExclusion,
} from "@/server/upstream-monitor-rate-exclusions";

export const blTargetTypeSchema = z.enum(["account", "group"]);

export const blSourceBindingInputSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  sourceSiteName: z.string().trim().min(1).max(200),
  sourceGroupId: z.string().trim().min(1).max(200),
  sourceGroupName: z.string().trim().max(200).nullable().optional(),
  sourcePlatform: z.string().trim().max(100).nullable().optional(),
});

const rateRuleInputSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["first", "average", "min", "max", "custom"]).default("first"),
  offset: z.number().finite().min(-100_000).max(100_000).default(0),
  expression: z.string().trim().max(500).nullable().optional(),
});
export const groupRateRuleInputSchema = rateRuleInputSchema;
export const accountRateRuleInputSchema = rateRuleInputSchema;

type BlTargetType = z.infer<typeof blTargetTypeSchema>;
type BlSourceBindingInput = z.infer<typeof blSourceBindingInputSchema>;
export type GroupRateRuleInput = z.infer<typeof groupRateRuleInputSchema>;
export type AccountRateRuleInput = z.infer<typeof accountRateRuleInputSchema>;

type BlRateRow = Awaited<ReturnType<BlPublicClient["fetchRates"]>>[number];

export type BindingWithRate = {
  id: number;
  connectionId: number;
  targetType: BlTargetType;
  targetId: number;
  sourceSiteId: number;
  sourceSiteName: string;
  sourceGroupId: string;
  sourceGroupName: string | null;
  sourcePlatform: string | null;
  currentRate: number | null;
  actualRate: number | null;
  effectiveRate: number | null;
  monitorExcluded?: boolean;
  monitorExclusions?: Array<{
    accountId: number;
    accountName: string | null;
    reason: string | null;
    pausedAt: Date;
  }>;
};

export type GroupRuleRow = {
  groupId: number;
  enabled: boolean;
  mode: GroupRateRuleInput["mode"];
  offset: number;
  expression: string | null;
};

export type AccountRuleRow = {
  accountId: number;
  enabled: boolean;
  mode: AccountRateRuleInput["mode"];
  offset: number;
  expression: string | null;
};

function sourceKey(siteId: number, groupId: string) {
  return `${siteId}:${groupId}`;
}

function normalizeNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRule(rule?: Partial<GroupRateRuleInput> | null): GroupRateRuleInput {
  return {
    enabled: rule?.enabled ?? false,
    mode: rule?.mode ?? "first",
    offset: Number.isFinite(rule?.offset) ? Number(rule?.offset) : 0,
    expression: normalizeNullable(rule?.expression),
  };
}

function buildRateIndex(rates: BlRateRow[]) {
  return new Map(rates.map((rate) => [sourceKey(rate.site_id, rate.group_id), rate]));
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeResultRate(value: number) {
  return normalizeRateMultiplier(value);
}

export async function replaceBlSourceBindings(input: {
  connectionId: number;
  targetType: BlTargetType;
  targetId: number;
  bindings: BlSourceBindingInput[];
}) {
  const deduped = Array.from(
    new Map(input.bindings.map((binding) => [sourceKey(binding.sourceSiteId, binding.sourceGroupId), binding])).values(),
  );

  await db.$transaction(async (tx) => {
    await tx.blSourceBinding.deleteMany({
      where: {
        connectionId: input.connectionId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });

    if (deduped.length === 0) return;

    await tx.blSourceBinding.createMany({
      data: deduped.map((binding) => ({
        connectionId: input.connectionId,
        targetType: input.targetType,
        targetId: input.targetId,
        sourceSiteId: binding.sourceSiteId,
        sourceSiteName: binding.sourceSiteName,
        sourceGroupId: binding.sourceGroupId,
        sourceGroupName: normalizeNullable(binding.sourceGroupName),
        sourcePlatform: normalizeNullable(binding.sourcePlatform),
      })),
    });
  });

  return { ok: true, count: deduped.length };
}

export async function saveGroupRateRule(input: {
  connectionId: number;
  groupId: number;
  rule: GroupRateRuleInput;
}) {
  const rule = normalizeRule(input.rule);
  const row = await db.blGroupRateRule.upsert({
    where: { connectionId_groupId: { connectionId: input.connectionId, groupId: input.groupId } },
    create: {
      connectionId: input.connectionId,
      groupId: input.groupId,
      enabled: rule.enabled,
      mode: rule.mode,
      offset: rule.offset,
      expression: rule.expression,
    },
    update: {
      enabled: rule.enabled,
      mode: rule.mode,
      offset: rule.offset,
      expression: rule.expression,
    },
  });

  return {
    groupId: row.groupId,
    enabled: row.enabled,
    mode: row.mode as GroupRateRuleInput["mode"],
    offset: row.offset,
    expression: row.expression,
  };
}

export async function saveAccountRateRule(input: {
  connectionId: number;
  accountId: number;
  rule: AccountRateRuleInput;
}) {
  const rule = normalizeRule(input.rule);
  const row = await db.blAccountRateRule.upsert({
    where: { connectionId_accountId: { connectionId: input.connectionId, accountId: input.accountId } },
    create: {
      connectionId: input.connectionId,
      accountId: input.accountId,
      enabled: rule.enabled,
      mode: rule.mode,
      offset: rule.offset,
      expression: rule.expression,
    },
    update: {
      enabled: rule.enabled,
      mode: rule.mode,
      offset: rule.offset,
      expression: rule.expression,
    },
  });

  return {
    accountId: row.accountId,
    enabled: row.enabled,
    mode: row.mode as AccountRateRuleInput["mode"],
    offset: row.offset,
    expression: row.expression,
  };
}

export async function listBlSourceBindings(input: {
  connectionId: number;
  targetType: BlTargetType;
  targetIds?: number[];
  blClient?: BlPublicClient | null;
}) {
  const rows = await db.blSourceBinding.findMany({
    where: {
      connectionId: input.connectionId,
      targetType: input.targetType,
      ...(input.targetIds?.length ? { targetId: { in: input.targetIds } } : {}),
    },
    orderBy: [{ targetId: "asc" }, { sourceSiteName: "asc" }, { sourceGroupName: "asc" }],
  });

  const rateIndex = input.blClient && rows.length > 0 ? buildRateIndex(await input.blClient.fetchRates()) : new Map<string, BlRateRow>();
  const groupIds = input.targetType === "group" ? Array.from(new Set(rows.map((row) => row.targetId))) : [];
  const exclusionsBySource: Map<string, MonitorRateExclusion[]> = input.targetType === "group" && groupIds.length > 0
    ? groupMonitorRateExclusionsBySource(await readActiveMonitorRateExclusions({
        db,
        connectionId: input.connectionId,
        groupIds,
      }))
    : new Map<string, MonitorRateExclusion[]>();
  const bindings: BindingWithRate[] = rows.map((row) => {
    const rate = rateIndex.get(sourceKey(row.sourceSiteId, row.sourceGroupId));
    const monitorExclusions = exclusionsBySource.get(monitorGroupRateExclusionKey(row.targetId, row.sourceSiteId, row.sourceGroupId)) ?? [];
    return {
      id: row.id,
      connectionId: row.connectionId,
      targetType: row.targetType as BlTargetType,
      targetId: row.targetId,
      sourceSiteId: row.sourceSiteId,
      sourceSiteName: row.sourceSiteName,
      sourceGroupId: row.sourceGroupId,
      sourceGroupName: row.sourceGroupName,
      sourcePlatform: row.sourcePlatform,
      currentRate: resolveBlRateMultiplier(rate),
      actualRate: toFiniteNumber(rate?.actual_rate_multiplier),
      effectiveRate: resolveBlEffectiveRate(rate),
      monitorExcluded: monitorExclusions.length > 0,
      monitorExclusions: monitorExclusions.map((exclusion) => ({
        accountId: exclusion.accountId,
        accountName: exclusion.accountName,
        reason: exclusion.reason,
        pausedAt: exclusion.pausedAt,
      })),
    };
  });

  const groupRules = input.targetType === "group"
    ? await db.blGroupRateRule.findMany({
        where: {
          connectionId: input.connectionId,
          ...(input.targetIds?.length ? { groupId: { in: input.targetIds } } : {}),
        },
        orderBy: { groupId: "asc" },
      })
    : [];
  const accountRules = input.targetType === "account"
    ? await db.blAccountRateRule.findMany({
        where: {
          connectionId: input.connectionId,
          ...(input.targetIds?.length ? { accountId: { in: input.targetIds } } : {}),
        },
        orderBy: { accountId: "asc" },
      })
    : [];

  return {
    bindings,
    rules: groupRules.map<GroupRuleRow>((row) => ({
      groupId: row.groupId,
      enabled: row.enabled,
      mode: row.mode as GroupRateRuleInput["mode"],
      offset: row.offset,
      expression: row.expression,
    })),
    accountRules: accountRules.map<AccountRuleRow>((row) => ({
      accountId: row.accountId,
      enabled: row.enabled,
      mode: row.mode as AccountRateRuleInput["mode"],
      offset: row.offset,
      expression: row.expression,
    })),
  };
}

function safeEvaluateCustomExpression(expression: string, rates: number[], current: number | null) {
  if (!/^[\d\s+\-*/%().,_a-zA-Z]+$/.test(expression)) {
    throw new Error("自定义公式只能包含数字、变量、函数和数学运算符");
  }

  const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const allowed = new Set([
    "abs",
    "avg",
    "ceil",
    "clamp",
    "count",
    "current",
    "first",
    "floor",
    "max",
    "min",
    "rate",
    "round",
    "sum",
  ]);

  for (const identifier of identifiers) {
    if (!allowed.has(identifier) && !/^r\d+$/.test(identifier)) {
      throw new Error(`自定义公式包含不支持的变量或函数：${identifier}`);
    }
  }

  const avg = rates.reduce((total, value) => total + value, 0) / rates.length;
  const vars: Record<string, unknown> = {
    abs: Math.abs,
    avg,
    ceil: Math.ceil,
    clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
    count: rates.length,
    current: current ?? 0,
    first: rates[0],
    floor: Math.floor,
    max: (...values: number[]) => Math.max(...(values.length ? values : rates)),
    min: (...values: number[]) => Math.min(...(values.length ? values : rates)),
    rate: (index: number) => rates[index] ?? 0,
    round: (value: number, digits = 4) => {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    },
    sum: (...values: number[]) => (values.length ? values : rates).reduce((total, value) => total + value, 0),
  };

  for (let index = 0; index < Math.max(rates.length, 20); index += 1) {
    vars[`r${index}`] = rates[index] ?? 0;
  }

  const argNames = Object.keys(vars);
  const argValues = Object.values(vars);
  const fn = new Function(...argNames, `"use strict"; return (${expression});`);
  return Number(fn(...argValues));
}

export function evaluateGroupRateRule(input: {
  rule?: Partial<GroupRateRuleInput> | null;
  sourceRates: Array<number | null | undefined>;
  currentRate?: number | null;
}) {
  const rates = input.sourceRates.map(toFiniteNumber).filter((value): value is number => value !== null);
  if (rates.length === 0) {
    throw new Error("没有可用于计算的采集源倍率");
  }

  const rule = normalizeRule(input.rule);
  const avg = rates.reduce((total, value) => total + value, 0) / rates.length;
  let base: number;

  switch (rule.mode) {
    case "average":
      base = avg;
      break;
    case "min":
      base = Math.min(...rates);
      break;
    case "max":
      base = Math.max(...rates);
      break;
    case "custom":
      base = safeEvaluateCustomExpression(rule.expression || "avg", rates, input.currentRate ?? null);
      break;
    case "first":
    default:
      base = rates[0];
      break;
  }

  const result = normalizeResultRate(base + rule.offset);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error("规则计算结果必须是大于 0 的有效倍率");
  }
  if (result > 100_000) {
    throw new Error("规则计算结果超过允许范围");
  }
  return result;
}
