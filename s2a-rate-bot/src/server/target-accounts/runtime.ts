import { createJsonHttpClient } from "../../adapters/http-client.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createSub2TargetAccountClient } from "./client.ts";
import { createTargetAccountService, type TargetAccountService } from "./service.ts";
import { createSqliteTargetAccountStore } from "./store.ts";
import type { TargetAccountClient } from "./types.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalAccounts = globalThis as typeof globalThis & { s2aTargetAccountService?: TargetAccountService };

export function getRuntimeTargetAccountService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalAccounts.s2aTargetAccountService) return globalAccounts.s2aTargetAccountService;
  const settings = getRuntimeSettingsService(env);
  const service = createTargetAccountService({
    client: dynamicClient(settings),
    store: createSqliteTargetAccountStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
  });
  if (env === process.env) globalAccounts.s2aTargetAccountService = service;
  return service;
}

function dynamicClient(settings: ReturnType<typeof getRuntimeSettingsService>): TargetAccountClient {
  return {
    listAccounts: async () => (await configuredClient(settings)).listAccounts(),
    setSchedulable: async (accountId, schedulable) => (await configuredClient(settings)).setSchedulable(accountId, schedulable),
  };
}

async function configuredClient(settingsService: ReturnType<typeof getRuntimeSettingsService>) {
  const settings = await settingsService.get();
  if (!settings.target) throw new Error("请先配置目标站");
  const http = createJsonHttpClient({
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  });
  return createSub2TargetAccountClient({ baseUrl: settings.target.baseUrl, adminApiKey: settings.target.adminApiKey, http });
}
