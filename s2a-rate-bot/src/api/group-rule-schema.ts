import { z } from "zod";
import type { GroupRuleSettings } from "../storage/app-config.ts";

export const groupRuleInputSchema = z.object({
  targetGroupId: z.number().int().positive(),
  targetGroupName: z.string().trim().min(1),
  currentRate: z.number().finite().nullable().default(null),
  enabled: z.boolean().default(true),
  mode: z.enum(["first", "average", "min", "max", "avg_formula"]).default("max"),
  offset: z.number().finite().default(0),
  multiplier: z.number().finite().default(1),
  formula: z.string().trim().default("avg"),
  sourceGroupId: z.string().trim().optional(),
  sourceGroupIds: z.array(z.string().trim().min(1)).default([]),
});

export const groupRuleSchema = groupRuleInputSchema.transform(normalizeGroupRule);

export function parseGroupRule(value: unknown) {
  return groupRuleSchema.parse(value);
}

function normalizeGroupRule(value: z.infer<typeof groupRuleInputSchema>): GroupRuleSettings {
  return {
    targetGroupId: value.targetGroupId,
    targetGroupName: value.targetGroupName,
    currentRate: value.currentRate,
    enabled: value.enabled,
    mode: value.mode,
    offset: value.offset,
    multiplier: value.multiplier,
    formula: value.formula,
    sourceGroupIds: normalizedSourceGroupIds(value.sourceGroupIds, value.sourceGroupId),
  };
}

function normalizedSourceGroupIds(sourceGroupIds: readonly string[], sourceGroupId?: string) {
  const values = sourceGroupIds.length > 0 ? sourceGroupIds : [sourceGroupId ?? ""];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
