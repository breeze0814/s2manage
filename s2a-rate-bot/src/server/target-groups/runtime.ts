import { createJsonHttpClient } from "../../adapters/http-client.ts";
import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createSub2TargetGroupClient } from "./client.ts";
import { createTargetGroupService, type TargetGroupService } from "./service.ts";
import { createSqliteTargetGroupStore } from "./store.ts";
import type { TargetGroupClient } from "./types.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalTargetGroups = globalThis as typeof globalThis & { s2aTargetGroupService?: TargetGroupService };

export function getRuntimeTargetGroupService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalTargetGroups.s2aTargetGroupService) return globalTargetGroups.s2aTargetGroupService;
  const settings = getRuntimeSettingsService(env);
  const collection = getRuntimeCollectionService(env);
  const service = createTargetGroupService({
    store: createSqliteTargetGroupStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    client: dynamicClient(settings),
    sourceRates: () => collection.rates(),
  });
  if (env === process.env) globalTargetGroups.s2aTargetGroupService = service;
  return service;
}

function dynamicClient(settings: ReturnType<typeof getRuntimeSettingsService>): TargetGroupClient {
  return {
    listGroups: async () => (await configuredClient(settings)).listGroups(),
    updateGroupRate: async (groupId, rate) => (await configuredClient(settings)).updateGroupRate(groupId, rate),
  };
}

async function configuredClient(settingsService: ReturnType<typeof getRuntimeSettingsService>) {
  const settings = await settingsService.get();
  if (!settings.target) throw new Error("请先配置目标站");
  const http = createJsonHttpClient({
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  });
  return createSub2TargetGroupClient({ baseUrl: settings.target.baseUrl, adminApiKey: settings.target.adminApiKey, http });
}
