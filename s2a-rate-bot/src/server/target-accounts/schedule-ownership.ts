import { randomUUID } from "node:crypto";
import { createSqliteConnectionHealthStore } from "../connection-health/store.ts";
import { OPERATION_LEASE_DURATION_MS, targetScheduleLeaseKey } from "../runtime-leases/keys.ts";
import { createSqliteRuntimeLeaseStore } from "../runtime-leases/store.ts";
import { TargetScheduleConflictError } from "./errors.ts";

export type TargetScheduleOwnership = Readonly<{
  runWritable: <T>(input: Readonly<{ accountId: number; task: () => Promise<T> }>) => Promise<T>;
  close: () => void;
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

async function runWritable<T>(
  context: OwnershipContext,
  input: Readonly<{ accountId: number; task: () => Promise<T> }>,
) {
  const at = context.now();
  const ownerId = context.leaseId();
  const key = targetScheduleLeaseKey(input.accountId);
  const acquired = context.leases.tryAcquire({
    key,
    ownerId,
    expiresAt: new Date(at.getTime() + OPERATION_LEASE_DURATION_MS).toISOString(),
  }, at.toISOString());
  if (!acquired) throw new TargetScheduleConflictError("目标账号当前已有调度状态操作执行中");
  try {
    assertUnowned(context, input.accountId);
    return await input.task();
  } finally {
    context.leases.release(key, ownerId);
  }
}

function assertUnowned(context: OwnershipContext, accountId: number) {
  const state = context.health.actionStateByAccount(accountId);
  if (state) {
    throw new TargetScheduleConflictError(`目标账号调度状态已由真实连接 ${state.connectionId} 接管`);
  }
}

type OwnershipContext = Readonly<{
  health: ReturnType<typeof createSqliteConnectionHealthStore>;
  leases: ReturnType<typeof createSqliteRuntimeLeaseStore>;
  now: () => Date;
  leaseId: () => string;
}>;
