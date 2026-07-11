import { z } from "zod";
import type { SecretCipher } from "../crypto.ts";
import type { SettingsStore } from "./store.ts";

export const targetSettingsSchema = z.object({
  name: z.string().trim().min(1, "目标站名称不能为空"),
  baseUrl: z.string().trim().url("目标站地址无效").transform((value) => value.replace(/\/+$/, "")),
  adminApiKey: z.string().trim().min(1, "Admin Key 不能为空"),
  rechargeRatio: z.number().finite().positive("目标站充值倍率必须大于 0"),
});

const proxySettingsSchema = z.object({
  enabled: z.boolean(),
  proxyUrl: z.string().trim(),
}).superRefine((value, context) => {
  if (value.enabled && !value.proxyUrl) {
    context.addIssue({ code: "custom", message: "启用代理时必须填写代理地址", path: ["proxyUrl"] });
  }
  if (value.proxyUrl && !/^https?:\/\//i.test(value.proxyUrl)) {
    context.addIssue({ code: "custom", message: "代理地址必须使用 http:// 或 https://", path: ["proxyUrl"] });
  }
});

const workerSettingsSchema = z.object({
  intervalSeconds: z.number().int().positive("运行间隔必须是正整数"),
  timeoutSeconds: z.number().int().positive("请求超时必须是正整数"),
  concurrency: z.number().int().positive("并发数必须是正整数"),
});

export const appSettingsSchema = z.object({
  target: targetSettingsSchema,
  proxy: proxySettingsSchema,
  worker: workerSettingsSchema,
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type SettingsSnapshot = {
  readonly target: AppSettings["target"] | null;
  readonly proxy: AppSettings["proxy"];
  readonly worker: AppSettings["worker"];
};

export type SettingsService = {
  readonly get: () => Promise<SettingsSnapshot>;
  readonly save: (settings: unknown) => Promise<AppSettings>;
};

export function createSettingsService(input: {
  readonly store: SettingsStore;
  readonly cipher: SecretCipher;
}): SettingsService {
  return {
    get: async () => settingsSnapshot(input),
    save: async (settings) => saveSettings(input, settings),
  };
}

function settingsSnapshot(input: SettingsDependencies): SettingsSnapshot {
  const stored = input.store.get();
  if (!stored) return defaultSettings();
  return {
    target: {
      name: stored.targetName,
      baseUrl: stored.targetBaseUrl,
      adminApiKey: input.cipher.decrypt(stored.targetAdminKeyEnc),
      rechargeRatio: stored.targetRechargeRatio,
    },
    proxy: { enabled: stored.proxyEnabled, proxyUrl: stored.proxyUrl },
    worker: {
      intervalSeconds: stored.workerIntervalSeconds,
      timeoutSeconds: stored.workerTimeoutSeconds,
      concurrency: stored.workerConcurrency,
    },
  };
}

function saveSettings(input: SettingsDependencies, raw: unknown) {
  const settings = appSettingsSchema.parse(raw);
  input.store.save({
    targetName: settings.target.name,
    targetBaseUrl: settings.target.baseUrl,
    targetAdminKeyEnc: input.cipher.encrypt(settings.target.adminApiKey),
    targetRechargeRatio: settings.target.rechargeRatio,
    proxyEnabled: settings.proxy.enabled,
    proxyUrl: settings.proxy.proxyUrl,
    workerIntervalSeconds: settings.worker.intervalSeconds,
    workerTimeoutSeconds: settings.worker.timeoutSeconds,
    workerConcurrency: settings.worker.concurrency,
  });
  return settings;
}

function defaultSettings(): SettingsSnapshot {
  return {
    target: null,
    proxy: { enabled: false, proxyUrl: "" },
    worker: { intervalSeconds: 600, timeoutSeconds: 25, concurrency: 3 },
  };
}

type SettingsDependencies = {
  readonly store: SettingsStore;
  readonly cipher: SecretCipher;
};
