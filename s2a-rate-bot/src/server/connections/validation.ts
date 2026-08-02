import { z } from "zod";

const groupTypeSchema = z.enum(["openai", "anthropic", "gemini", "antigravity"]);
const modeSchema = z.enum(["managed", "existing"]);

const createSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  sourceGroupId: z.string().trim().min(1),
  targetGroupIds: z.array(z.number().int().positive()).min(1)
    .transform((ids) => [...new Set(ids)]),
  groupType: groupTypeSchema,
  addToPricingMapping: z.boolean().default(true),
  operationId: z.string().trim().min(8).max(100),
  mode: modeSchema.default("managed"),
  sourceCredentialId: z.string().trim().min(1).optional(),
  targetAccountId: z.number().int().positive().optional(),
}).superRefine((value, context) => validateResourceSelection(value, context));

const disconnectSchema = z.object({
  mode: z.enum(["unlink", "full"]),
  removePricingMapping: z.boolean().default(true),
});

const resourceOptionsSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  targetGroupIds: z.array(z.number().int().positive()).min(1)
    .transform((ids) => [...new Set(ids)]),
});

const connectionIdSchema = z.string().uuid("真实连接 ID 无效");

export function parseCreate(value: unknown) {
  return createSchema.parse(value);
}

export function parseDisconnect(value: unknown) {
  return disconnectSchema.parse(value);
}

export function parseResourceOptions(value: unknown) {
  return resourceOptionsSchema.parse(value);
}

export function parseConnectionId(value: string) {
  return connectionIdSchema.parse(value);
}

function validateResourceSelection(value: ResourceSelection, context: z.RefinementCtx) {
  if (value.mode === "existing") {
    if (!value.sourceCredentialId) addIssue(context, "现有资源绑定必须选择采集站凭据", ["sourceCredentialId"]);
    if (!value.targetAccountId) addIssue(context, "现有资源绑定必须选择目标账号", ["targetAccountId"]);
    return;
  }
  if (value.sourceCredentialId) addIssue(context, "托管创建不能指定现有采集站凭据", ["sourceCredentialId"]);
  if (value.targetAccountId) addIssue(context, "托管创建不能指定现有目标账号", ["targetAccountId"]);
}

function addIssue(context: z.RefinementCtx, message: string, path: readonly string[]) {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path: [...path] });
}

type ResourceSelection = Readonly<{
  mode: "managed" | "existing";
  sourceCredentialId?: string;
  targetAccountId?: number;
}>;
export type ParsedCreate = z.output<typeof createSchema>;
export type ParsedDisconnect = z.output<typeof disconnectSchema>;
