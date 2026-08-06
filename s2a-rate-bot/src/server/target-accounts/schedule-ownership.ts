import { randomUUID } from "node:crypto";
import { createSqliteConnectionHealthStore } from "../connection-health/store.ts";
import { OPERATION_LEASE_DURATION_MS, targetScheduleLeaseKey } from "../runtime-leases/keys.ts";
import { createSqliteRuntimeLeaseStore } from "../runtime-leases/store.ts";
import { createRedisRuntimeLeaseStore } from "../runtime-leases/redis-store.ts";
import type { RuntimeRedis } from "../infrastructure/redis.ts";
import type { ConnectionHealthStore } from "../connection-health/store.ts";
import type { RuntimeLeaseStore } from "../runtime-leases/store.ts";
import { TargetScheduleConflictError } from "./errors.ts";

export type TargetScheduleOwnership = Readonly<{
  runWritable: <T>(input: Readonly<{ accountId: number; task: () => Promise<T> }>) => Promise<T>;
  close: () => void | Promise<void>;
}>;

export function createSqliteTargetScheduleOwnership(databaseUrl: string): TargetScheduleOwnership {
  const health = createSqliteConnectionHealthStore(databaseUrl);
  const leases = createSqliteRuntimeLeaseStore(databaseUrl);
  const context = { health, leases, now: () => new Date(), leaseId: randomUUID } as const;
  return {
    runWritable: (input) => runWritable(context, input),
    close: () => {
      leases.close();
      health.close();
    },
  };
}

export function createRedisTargetScheduleOwnership(input: Readonly<{
  health: Pick<ConnectionHealthStore, "actionStateByAccount">;
  redis: RuntimeRedis;
}>): TargetScheduleOwnership {
  const leases = createRedisRuntimeLeaseStore(input.redis);
  const context = { health: input.health, leases, now: () => new Date(), leaseId: randomUUID } as const;
  return { runWritable: (value) => runWritable(context, value), close: () => leases.close() };
}

async function runWritable<T>(
  context: OwnershipContext,
  input: Readonly<{ accountId: number; task: () => Promise<T> }>,
) {
  const at = context.now();
  const ownerId = context.leaseId();
  const key = targetScheduleLeaseKey(input.accountId);
  const acquired = await context.leases.tryAcquire({
    key,
    ownerId,
    expiresAt: new Date(at.getTime() + OPERATION_LEASE_DURATION_MS).toISOString(),
  }, at.toISOString());
  if (!acquired) throw new TargetScheduleConflictError("目标账号当前已有调度状态操作执行中");
  try {
    await assertUnowned(context, input.accountId);
    return await input.task();
  } finally {
    await context.leases.release(key, ownerId);
  }
}

async function assertUnowned(context: OwnershipContext, accountId: number) {
  const state = await context.health.actionStateByAccount(accountId);
  if (state) {
    throw new TargetScheduleConflictError(`目标账号调度状态已由真实连接 ${state.connectionId} 接管`);
  }
}

type OwnershipContext = Readonly<{
  health: Pick<ConnectionHealthStore, "actionStateByAccount">;
  leases: RuntimeLeaseStore;
  now: () => Date;
  leaseId: () => string;
}>;
