import type { RuntimeRedis } from "../infrastructure/redis.ts";
import type { RuntimeLease, RuntimeLeaseStore } from "./store.ts";

const KEY_PREFIX = "s2a:runtime:lease:";
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export function createRedisRuntimeLeaseStore(redis: RuntimeRedis): RuntimeLeaseStore {
  return {
    tryAcquire: (lease, updatedAt) => tryAcquire(redis, lease, updatedAt),
    release: (key, ownerId) => release(redis, key, ownerId),
    close: async () => undefined,
  };
}

async function tryAcquire(redis: RuntimeRedis, lease: RuntimeLease, updatedAt: string) {
  const ttlMs = Date.parse(lease.expiresAt) - Date.parse(updatedAt);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error(`运行时租约期限无效: ${lease.key}`);
  await redis.ready;
  const result = await redis.client.set(redisKey(lease.key), lease.ownerId, { NX: true, PX: ttlMs });
  return result === "OK";
}

async function release(redis: RuntimeRedis, key: string, ownerId: string) {
  await redis.ready;
  await redis.client.eval(RELEASE_SCRIPT, { keys: [redisKey(key)], arguments: [ownerId] });
}

function redisKey(key: string) { return `${KEY_PREFIX}${key}`; }
