import { createAesGcmSecretCipher } from "../crypto.ts";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createDefaultCollectionCollector } from "./collector.ts";
import { createDefaultChannelMonitorCollector } from "./channel-monitor-collector.ts";
import { createCollectionService, type CollectionService } from "./service.ts";
import { createPostgresCollectionStore } from "./postgres-store.ts";

const globalCollection = globalThis as typeof globalThis & { s2aCollectionService?: CollectionService };

export function getRuntimeCollectionService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalCollection.s2aCollectionService) return globalCollection.s2aCollectionService;
  const secret = env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  const settings = getRuntimeSettingsService(env);
  const infrastructure = getRuntimeInfrastructure(env);
  const service = createCollectionService({
    store: createPostgresCollectionStore(infrastructure.postgres),
    cipher: createAesGcmSecretCipher(secret),
    collector: createDefaultCollectionCollector(),
    channelMonitorCollector: createDefaultChannelMonitorCollector({ settings }),
    requestOptions: async () => requestOptions(await settings.get()),
    afterRefreshSuccess: async (siteId) => {
      const { getRuntimeConnectionService } = await import("../connections/runtime.ts");
      await getRuntimeConnectionService(env).syncAccountNames(siteId);
    },
  });
  if (env === process.env) globalCollection.s2aCollectionService = service;
  return service;
}

function requestOptions(settings: Awaited<ReturnType<ReturnType<typeof getRuntimeSettingsService>["get"]>>) {
  if (!settings.target) throw new Error("请先配置目标站及其充值倍率");
  return {
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
    targetRechargeRatio: settings.target.rechargeRatio,
  };
}
