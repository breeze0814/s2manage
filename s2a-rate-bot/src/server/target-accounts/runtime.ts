import { createJsonHttpClient } from "../../adapters/http-client.ts";
import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createSub2TargetAccountClient } from "./client.ts";
import { createTargetAccountService, type TargetAccountService } from "./service.ts";
import { createSqliteTargetAccountStore } from "./store.ts";
import type { TargetAccountClient } from "./types.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
// Increment when the cached service contract or its dependencies change.
const TARGET_ACCOUNT_RUNTIME_VERSION = 2;

type TargetAccountRuntime = Readonly<{
  version: number;
  service: TargetAccountService;
  dispose: () => void;
}>;

type TargetAccountRuntimeCache = TargetAccountRuntime | TargetAccountService;
const globalAccounts = globalThis as typeof globalThis & { s2aTargetAccountService?: TargetAccountRuntimeCache };

export function getRuntimeTargetAccountService(env: NodeJS.ProcessEnv = process.env): TargetAccountService {
  const cached = globalAccounts.s2aTargetAccountService;
  if (env === process.env && isRuntimeCache(cached)) {
    if (cached.version === TARGET_ACCOUNT_RUNTIME_VERSION) return cached.service;
    cached.dispose();
  }
  const runtime = buildTargetAccountRuntime(env);
  if (env === process.env) globalAccounts.s2aTargetAccountService = runtime;
  return runtime.service;
}

function buildTargetAccountRuntime(env: NodeJS.ProcessEnv): TargetAccountRuntime {
  const settings = getRuntimeSettingsService(env);
  const collection = getRuntimeCollectionService(env);
  const store = createSqliteTargetAccountStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const service = createTargetAccountService({
    client: dynamicClient(settings),
    store,
    sourceRates: () => collection.rates(),
    testConcurrency: async () => (await settings.get()).worker.concurrency,
  });
  return { version: TARGET_ACCOUNT_RUNTIME_VERSION, service, dispose: store.close };
}

function isRuntimeCache(cache: TargetAccountRuntimeCache | undefined): cache is TargetAccountRuntime {
  return Boolean(cache && "version" in cache && "service" in cache && "dispose" in cache);
}

function dynamicClient(settings: ReturnType<typeof getRuntimeSettingsService>): TargetAccountClient {
  return {
    listAccounts: async () => (await configuredClient(settings)).listAccounts(),
    testChannel: async (accountId) => (await configuredClient(settings)).testChannel(accountId),
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
