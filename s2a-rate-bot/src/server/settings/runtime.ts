import { createAesGcmSecretCipher } from "../crypto.ts";
import { createSettingsService, type SettingsService } from "./service.ts";
import { createSqliteSettingsStore } from "./store.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalSettings = globalThis as typeof globalThis & { s2aSettingsService?: SettingsService };

export function getRuntimeSettingsService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalSettings.s2aSettingsService) return globalSettings.s2aSettingsService;
  const service = buildSettingsService(env);
  if (env === process.env) globalSettings.s2aSettingsService = service;
  return service;
}

function buildSettingsService(env: NodeJS.ProcessEnv) {
  const appSecret = env.APP_SECRET;
  if (!appSecret) throw new Error("APP_SECRET is required");
  return createSettingsService({
    store: createSqliteSettingsStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    cipher: createAesGcmSecretCipher(appSecret),
  });
}
