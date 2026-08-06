import { createAesGcmSecretCipher } from "../crypto.ts";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { createPostgresSettingsStore } from "./postgres-store.ts";
import { createSettingsService, type SettingsService } from "./service.ts";

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
  const infrastructure = getRuntimeInfrastructure(env);
  return createSettingsService({
    store: createPostgresSettingsStore(infrastructure.postgres),
    cipher: createAesGcmSecretCipher(appSecret),
  });
}
