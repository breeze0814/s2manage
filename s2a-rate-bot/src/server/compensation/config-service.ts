import { z } from "zod";
import type { CompensationRule } from "../../core/compensation.ts";
import type { SecretCipher } from "../crypto.ts";
import type { CompensationConfigStore, StoredCompensationSettings } from "./config-store.ts";
import type {
  AdminCompensationSettings,
  CompensationSettings,
  PublicCompensationSettings,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://www.ldxp.cn";
const DEFAULT_RULES: readonly CompensationRule[] = Object.freeze([
  Object.freeze({
    id: "third-prize",
    name: "三等奖",
    startAt: "2026-06-30T16:00:00.000Z",
    endAt: "2026-07-09T16:00:00.000Z",
    ratePercent: 30,
  }),
  Object.freeze({
    id: "second-prize",
    name: "二等奖",
    startAt: "2026-07-09T16:00:00.000Z",
    endAt: "2026-07-19T16:00:00.000Z",
    ratePercent: 50,
  }),
  Object.freeze({
    id: "first-prize",
    name: "一等奖",
    startAt: "2026-07-19T16:00:00.000Z",
    endAt: "2026-07-31T16:00:00.000Z",
    ratePercent: 100,
  }),
]);

const ruleSchema = z.object({
  id: z.string().trim().min(1, "规则 ID 不能为空"),
  name: z.string().trim().min(1, "规则名称不能为空"),
  startAt: z.string().datetime({ offset: true, message: "规则开始时间无效" }),
  endAt: z.string().datetime({ offset: true, message: "规则结束时间无效" }),
  ratePercent: z.number().int("补偿比例必须是整数").min(1).max(100),
}).refine((rule) => Date.parse(rule.startAt) < Date.parse(rule.endAt), {
  message: "规则结束时间必须晚于开始时间",
  path: ["endAt"],
});

const configSchema = z.object({
  enabled: z.boolean(),
  activityName: z.string().trim().min(1, "活动名称不能为空"),
  description: z.string().trim(),
  baseUrl: z.string().trim().url("联动小铺地址无效").transform(trimUrl),
  username: z.string().trim(),
  password: z.string().optional(),
  rules: z.array(ruleSchema).min(1, "至少配置一条补偿规则"),
});
const patchSchema = configSchema.superRefine(validateRules);

export type CompensationConfigService = ReturnType<typeof createCompensationConfigService>;

export function createCompensationConfigService(input: Readonly<{
  store: CompensationConfigStore;
  cipher: SecretCipher;
}>) {
  return {
    get: (): CompensationSettings => settingsSnapshot(input),
    getAdmin: (): AdminCompensationSettings => adminSettings(settingsSnapshot(input)),
    getPublic: (): PublicCompensationSettings => publicSettings(settingsSnapshot(input)),
    update: (raw: unknown): AdminCompensationSettings => updateSettings(input, raw),
  };
}

function settingsSnapshot(input: ConfigDependencies): CompensationSettings {
  const stored = input.store.get();
  if (!stored) return defaultSettings();
  return {
    enabled: stored.enabled,
    activityName: stored.activityName,
    description: stored.description,
    baseUrl: stored.baseUrl,
    username: stored.username,
    password: stored.passwordEnc ? input.cipher.decrypt(stored.passwordEnc) : "",
    rules: stored.rules,
    updatedAt: stored.updatedAt,
  };
}

function updateSettings(input: ConfigDependencies, raw: unknown) {
  const current = settingsSnapshot(input);
  const patch = patchSchema.parse(raw);
  const password = patch.password || current.password;
  if (patch.enabled && (!patch.username || !password)) {
    throw new Error("启用活动前必须配置联动小铺用户名和密码");
  }
  const stored = input.store.save({
    enabled: patch.enabled,
    activityName: patch.activityName,
    description: patch.description,
    baseUrl: patch.baseUrl,
    username: patch.username,
    passwordEnc: password ? input.cipher.encrypt(password) : "",
    rules: patch.rules,
  });
  return adminSettings(storedSnapshot(stored, password));
}

function validateRules(value: z.infer<typeof configSchema>, context: z.RefinementCtx) {
  const ids = new Set<string>();
  for (const [index, rule] of value.rules.entries()) {
    if (ids.has(rule.id)) context.addIssue({ code: "custom", message: "规则 ID 不能重复", path: ["rules", index, "id"] });
    ids.add(rule.id);
  }
  const sorted = [...value.rules].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  for (let index = 1; index < sorted.length; index += 1) {
    if (Date.parse(sorted[index]!.startAt) < Date.parse(sorted[index - 1]!.endAt)) {
      context.addIssue({ code: "custom", message: "补偿规则时间不能重叠", path: ["rules"] });
      return;
    }
  }
}

function storedSnapshot(stored: StoredCompensationSettings, password: string): CompensationSettings {
  return {
    enabled: stored.enabled,
    activityName: stored.activityName,
    description: stored.description,
    baseUrl: stored.baseUrl,
    username: stored.username,
    password,
    rules: stored.rules,
    updatedAt: stored.updatedAt,
  };
}

function adminSettings(settings: CompensationSettings): AdminCompensationSettings {
  const { password, ...visible } = settings;
  return { ...visible, passwordConfigured: Boolean(password) };
}

function publicSettings(settings: CompensationSettings): PublicCompensationSettings {
  const { baseUrl: _baseUrl, username: _username, password: _password, ...visible } = settings;
  return visible;
}

function defaultSettings(): CompensationSettings {
  return {
    enabled: false,
    activityName: "联动小铺订单补偿",
    description: "",
    baseUrl: DEFAULT_BASE_URL,
    username: "",
    password: "",
    rules: DEFAULT_RULES,
    updatedAt: null,
  };
}

function trimUrl(value: string) { return value.replace(/\/+$/, ""); }
type ConfigDependencies = Parameters<typeof createCompensationConfigService>[0];
