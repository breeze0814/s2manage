import { createAesGcmSecretCipher } from "../crypto.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createDefaultCollectionCollector } from "./collector.ts";
import { createCollectionService, type CollectionService } from "./service.ts";
import { createSqliteCollectionStore } from "./store.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalCollection = globalThis as typeof globalThis & { s2aCollectionService?: CollectionService };

export function getRuntimeCollectionService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalCollection.s2aCollectionService) return globalCollection.s2aCollectionService;
  const secret = env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  const settings = getRuntimeSettingsService(env);
  const service = createCollectionService({
    store: createSqliteCollectionStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    cipher: createAesGcmSecretCipher(secret),
    collector: createDefaultCollectionCollector(),
    requestOptions: async () => requestOptions(await settings.get()),
  });
  if (env === process.env) globalCollection.s2aCollectionService = service;
  return service;
}

function requestOptions(settings: Awaited<ReturnType<ReturnType<typeof getRuntimeSettingsService>["get"]>>) {
  return {
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  };
}
