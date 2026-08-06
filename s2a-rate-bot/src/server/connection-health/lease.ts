import type { HealthContext } from "./context.ts";
import { HealthPolicyConflictError } from "./errors.ts";
import { OPERATION_LEASE_DURATION_MS, targetScheduleLeaseKey } from "../runtime-leases/keys.ts";

export async function withConnectionLease<T>(input: Readonly<{ context: HealthContext; connectionId: string; task: () => Promise<T> }>) {
  return withLease({ context: input.context, key: `connection-health:${input.connectionId}`, task: input.task });
}

export async function withScheduleLease<T>(input: Readonly<{
  context: HealthContext;
  accountId: number;
  task: () => Promise<T>;
}>) {
  return withLease({ context: input.context, key: targetScheduleLeaseKey(input.accountId), task: input.task });
}

export async function trySchedulerLease(input: Readonly<{ context: HealthContext; task: () => Promise<void> }>) {
  const ownerId = input.context.leaseId();
  const at = input.context.now();
  const acquired = await input.context.leases.tryAcquire({
    key: "connection-health:scheduler", ownerId,
    expiresAt: new Date(at.getTime() + OPERATION_LEASE_DURATION_MS).toISOString(),
  }, at.toISOString());
  if (!acquired) return false;
  try {
    await input.task();
    return true;
  } finally {
    await input.context.leases.release("connection-health:scheduler", ownerId);
  }
}

async function withLease<T>(input: Readonly<{ context: HealthContext; key: string; task: () => Promise<T> }>) {
  const ownerId = input.context.leaseId();
  const at = input.context.now();
  const acquired = await input.context.leases.tryAcquire({
    key: input.key, ownerId,
    expiresAt: new Date(at.getTime() + OPERATION_LEASE_DURATION_MS).toISOString(),
  }, at.toISOString());
  if (!acquired) throw new HealthPolicyConflictError("连接当前已有健康操作执行中");
  try {
    return await input.task();
  } finally {
    await input.context.leases.release(input.key, ownerId);
  }
}
