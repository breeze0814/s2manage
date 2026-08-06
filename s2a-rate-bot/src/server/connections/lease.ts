import { OPERATION_LEASE_DURATION_MS } from "../runtime-leases/keys.ts";
import type { ConnectionContext } from "./context.ts";
import { ConnectionBusyError } from "./errors.ts";

export function withSourceGroupLease<T>(input: Readonly<{
  context: ConnectionContext;
  siteId: number;
  groupId: string;
  task: () => Promise<T>;
}>) {
  return withLease({
    context: input.context,
    key: `connection-group:${input.siteId}:${input.groupId}`,
    task: input.task,
  });
}

export function withConnectionLease<T>(input: Readonly<{
  context: ConnectionContext;
  connectionId: string;
  task: () => Promise<T>;
}>) {
  return withLease({
    context: input.context,
    key: `connection-lifecycle:${input.connectionId}`,
    task: input.task,
  });
}

export async function tryReconcileLease(input: Readonly<{
  context: ConnectionContext;
  task: () => Promise<void>;
}>) {
  const lease = await acquire(input.context, "connection-lifecycle:reconcile");
  if (!lease) return false;
  try {
    await input.task();
    return true;
  } finally {
    await input.context.leases.release(lease.key, lease.ownerId);
  }
}

async function withLease<T>(input: Readonly<{
  context: ConnectionContext;
  key: string;
  task: () => Promise<T>;
}>) {
  const lease = await acquire(input.context, input.key);
  if (!lease) throw new ConnectionBusyError("真实连接当前已有生命周期操作执行中");
  try {
    return await input.task();
  } finally {
    await input.context.leases.release(lease.key, lease.ownerId);
  }
}

async function acquire(context: ConnectionContext, key: string) {
  const ownerId = context.leaseId();
  const at = context.now();
  const acquired = await context.leases.tryAcquire({
    key,
    ownerId,
    expiresAt: new Date(at.getTime() + OPERATION_LEASE_DURATION_MS).toISOString(),
  }, at.toISOString());
  return acquired ? { key, ownerId } : null;
}
