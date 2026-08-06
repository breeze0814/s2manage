import { randomUUID } from "node:crypto";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createRuntimeConnectionHealthGateway } from "../connections/health-gateway.ts";
import { createPostgresConnectionStore } from "../connections/postgres-store.ts";
import { createRedisRuntimeLeaseStore } from "../runtime-leases/redis-store.ts";
import { createPostgresTargetAccountStore } from "../target-accounts/postgres-store.ts";
import { createConnectionHealthService, type ConnectionHealthService } from "./service.ts";
import { createPostgresConnectionHealthStore } from "./postgres-store.ts";

const RUNTIME_VERSION = 3;
type RuntimeCache = { readonly version: number; readonly service: ConnectionHealthService; readonly close: () => void };
const runtime = globalThis as typeof globalThis & { s2aConnectionHealthRuntime?: RuntimeCache };

export function getRuntimeConnectionHealthService(env: NodeJS.ProcessEnv = process.env) {
  const cached = runtime.s2aConnectionHealthRuntime;
  if (env === process.env && cached?.version === RUNTIME_VERSION) return cached.service;
  cached?.close();
  const built = buildRuntime(env);
  if (env === process.env) runtime.s2aConnectionHealthRuntime = built;
  return built.service;
}

export function closeRuntimeConnectionHealthService() {
  runtime.s2aConnectionHealthRuntime?.close();
  delete runtime.s2aConnectionHealthRuntime;
}

export function createConnectionHealthRuntime(env: NodeJS.ProcessEnv = process.env) {
  return buildRuntime(env);
}

function buildRuntime(env: NodeJS.ProcessEnv): RuntimeCache {
  const infrastructure = getRuntimeInfrastructure(env);
  const store = createPostgresConnectionHealthStore(infrastructure.postgres);
  const connections = createPostgresConnectionStore(infrastructure.postgres);
  const leases = createRedisRuntimeLeaseStore(infrastructure.redis);
  const snapshots = createPostgresTargetAccountStore(infrastructure.postgres);
  const settings = getRuntimeSettingsService(env);
  const service = createConnectionHealthService({
    store,
    connections,
    gateway: createRuntimeConnectionHealthGateway({ settings, snapshots }),
    leases,
    leaseId: randomUUID,
    now: () => new Date(),
    concurrency: async () => (await settings.get()).worker.concurrency,
  });
  return {
    version: RUNTIME_VERSION,
    service,
    close: () => {
      snapshots.close();
      leases.close();
      connections.close();
      store.close();
    },
  };
}
