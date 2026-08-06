import { randomUUID } from "node:crypto";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { createConnectionHealthRuntime } from "../connection-health/runtime.ts";
import { createRedisRuntimeLeaseStore } from "../runtime-leases/redis-store.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { getRuntimeTargetGroupService } from "../target-groups/runtime.ts";
import { createRuntimeConnectionRemoteGateway } from "./remote-gateway.ts";
import { createConnectionService, type ConnectionService } from "./service.ts";
import { createPostgresConnectionStore } from "./postgres-store.ts";

const RUNTIME_VERSION = 2;
type RuntimeCache = { readonly version: number; readonly service: ConnectionService; readonly close: () => void };
const runtime = globalThis as typeof globalThis & { s2aConnectionRuntime?: RuntimeCache };

export function getRuntimeConnectionService(env: NodeJS.ProcessEnv = process.env) {
  const cached = runtime.s2aConnectionRuntime;
  if (env === process.env && cached?.version === RUNTIME_VERSION) return cached.service;
  cached?.close();
  const built = buildRuntime(env);
  if (env === process.env) runtime.s2aConnectionRuntime = built;
  return built.service;
}

export function createConnectionRuntime(env: NodeJS.ProcessEnv = process.env) {
  return buildRuntime(env);
}

function buildRuntime(env: NodeJS.ProcessEnv): RuntimeCache {
  const collection = getRuntimeCollectionService(env);
  const targetGroups = getRuntimeTargetGroupService(env);
  const settings = getRuntimeSettingsService(env);
  const infrastructure = getRuntimeInfrastructure(env);
  const store = createPostgresConnectionStore(infrastructure.postgres);
  const leases = createRedisRuntimeLeaseStore(infrastructure.redis);
  const health = createConnectionHealthRuntime(env);
  const service = createConnectionService({
    store,
    remote: createRuntimeConnectionRemoteGateway({ collection, settings }),
    sources: {
      sites: collection.list,
      rates: collection.catalog,
      setGroupType: collection.setRateGroupType,
    },
    pricing: { groups: targetGroups.list, save: targetGroups.saveSourceBindings },
    health: { release: (connectionId) => health.service.assign(connectionId, null) },
    leases,
    id: randomUUID,
    leaseId: randomUUID,
    now: () => new Date(),
    concurrency: async () => (await settings.get()).worker.concurrency,
  });
  return {
    version: RUNTIME_VERSION,
    service,
    close: () => {
      health.close();
      leases.close();
      store.close();
    },
  };
}
