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

const telegramSettingsSchema = z.object({
  botToken: z.string().trim(),
  chatId: z.string().trim(),
  hourlyBalanceEnabled: z.boolean(),
  rateChangeEnabled: z.boolean(),
}).superRefine((value, context) => {
  if (!value.hourlyBalanceEnabled && !value.rateChangeEnabled) return;
  if (!value.botToken) context.addIssue({ code: "custom", message: "启用 Telegram 推送时必须填写 Bot Token", path: ["botToken"] });
  if (!value.chatId) context.addIssue({ code: "custom", message: "启用 Telegram 推送时必须填写 Chat ID", path: ["chatId"] });
});

export const appSettingsSchema = z.object({
  target: targetSettingsSchema,
  proxy: proxySettingsSchema,
  worker: workerSettingsSchema,
  telegram: telegramSettingsSchema,
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type SettingsSnapshot = {
  readonly target: AppSettings["target"] | null;
  readonly proxy: AppSettings["proxy"];
  readonly worker: AppSettings["worker"];
  readonly telegram: AppSettings["telegram"];
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
    telegram: {
      botToken: stored.telegramBotTokenEnc ? input.cipher.decrypt(stored.telegramBotTokenEnc) : "",
      chatId: stored.telegramChatId,
      hourlyBalanceEnabled: stored.telegramHourlyBalanceEnabled,
      rateChangeEnabled: stored.telegramRateChangeEnabled,
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
    telegramBotTokenEnc: input.cipher.encrypt(settings.telegram.botToken),
    telegramChatId: settings.telegram.chatId,
    telegramHourlyBalanceEnabled: settings.telegram.hourlyBalanceEnabled,
    telegramRateChangeEnabled: settings.telegram.rateChangeEnabled,
  });
  return settings;
}

function defaultSettings(): SettingsSnapshot {
  return {
    target: null,
    proxy: { enabled: false, proxyUrl: "" },
    worker: { intervalSeconds: 600, timeoutSeconds: 25, concurrency: 3 },
    telegram: { botToken: "", chatId: "", hourlyBalanceEnabled: false, rateChangeEnabled: false },
  };
}

type SettingsDependencies = {
  readonly store: SettingsStore;
  readonly cipher: SecretCipher;
};
