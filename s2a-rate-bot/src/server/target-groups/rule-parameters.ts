import { z } from "zod";
import type { RuleParameters } from "./types.ts";

export const ruleParametersSchema = z.object({
  adjustmentMode: z.enum(["fixed", "percentage"]),
  adjustmentValue: z.number({ invalid_type_error: "倍率调整值必须是有效数字" })
    .finite("倍率调整值必须是有效数字"),
  minimum: z.number({ invalid_type_error: "计算最小值必须是有效数字" })
    .finite("计算最小值必须是有效数字")
    .nonnegative("计算最小值必须大于或等于 0"),
  formula: z.string().trim().min(1),
}) satisfies z.ZodType<RuleParameters>;
