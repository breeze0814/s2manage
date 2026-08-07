import { z } from "zod";
import { mapConcurrent } from "../concurrency.ts";
import type { ConnectionContext } from "./context.ts";
import { disconnectConnection, resumeDisconnect } from "./disconnection.ts";
import { ConnectionBusyError, ConnectionConflictError } from "./errors.ts";
import { tryReconcileLease, withConnectionLease, withSourceGroupLease } from "./lease.ts";
import { buildResourceName, combinedMessage, requiredConnection, resourcesGone, toView } from "./model.ts";
import {
  prepareConnection, provisionConnection, validateRetry,
} from "./provisioning.ts";
import type {
  ConnectionLifecycleEvent, ConnectionView, ExistingSourceCredential,
  ExistingTargetAccount, RealConnection,
} from "./types.ts";
import {
  parseConnectionId, parseCreate, parseDisconnect, parseResourceOptions,
  type ParsedCreate,
} from "./validation.ts";

export { ConnectionConflictError } from "./errors.ts";

export type ConnectionResourceOptions = Readonly<{
  sourceCredentials: readonly ExistingSourceCredential[];
  targetAccounts: readonly ExistingTargetAccount[];
}>;

export type ConnectionService = Readonly<{
  list: () => Promise<ConnectionView[]>;
  get: (id: string) => Promise<ConnectionView>;
  create: (input: unknown) => Promise<ConnectionView>;
  disconnect: (id: string, input: unknown) => Promise<ConnectionView>;
  resourceOptions: (input: unknown) => Promise<ConnectionResourceOptions>;
  events: (connectionId?: string, limit?: number) => Promise<ConnectionLifecycleEvent[]>;
  eventPage: (connectionId?: string, limit?: number, beforeId?: number) => Promise<Awaited<ReturnType<ConnectionContext["store"]["eventPage"]>>>;
  reconcile: () => Promise<boolean>;
  syncAccountNames: (sourceSiteId: number) => Promise<number>;
}>;

export function createConnectionService(context: ConnectionContext): ConnectionService {
  return {
    list: async () => (await context.store.list()).map(toView),
    get: async (id) => toView(await requiredConnection(context, parseConnectionId(id))),
    create: (raw) => createConnection(context, parseCreate(raw)),
    disconnect: (id, raw) => disconnectWithLease(context, parseConnectionId(id), parseDisconnect(raw)),
    resourceOptions: (raw) => listResourceOptions(context, parseResourceOptions(raw)),
    events: async (id, limit = 100) => (await context.store.eventPage({
      connectionId: parseOptionalId(id), limit: positiveLimit(limit),
    })).events.slice(),
    eventPage: async (id, limit = 50, beforeId) => context.store.eventPage({
      connectionId: parseOptionalId(id),
      limit: positiveLimit(limit),
      ...(beforeId === undefined ? {} : { beforeId: positiveLimit(beforeId) }),
    }),
    reconcile: () => tryReconcileLease({ context, task: () => reconcileConnections(context) }),
    syncAccountNames: (sourceSiteId) => syncAccountNames(context, sourceSiteId),
  };
}

async function syncAccountNames(context: ConnectionContext, sourceSiteId: number) {
  const [connections, rates, concurrency] = await Promise.all([
    context.store.list(),
    context.sources.rates(),
    context.concurrency(),
  ]);
  const candidates = connections.flatMap((connection) => {
    if (!managedActiveTarget(connection) || connection.sourceSiteId !== sourceSiteId) return [];
    const rate = rates.find((item) => item.sourceSiteId === sourceSiteId
      && item.groupId === connection.sourceGroupId && !item.deleted);
    if (!rate) return [];
    const desiredName = buildResourceName({
      sourceSiteName: connection.sourceSiteName,
      sourceGroupName: rate.groupName,
      effectiveRate: rate.effectiveRate,
    });
    return connection.targetAccountName === desiredName ? [] : [{ connectionId: connection.id, desiredName }];
  });
  const results = await mapConcurrent({
    items: candidates,
    concurrency,
    task: async ({ connectionId, desiredName }) => {
      try {
        const updated = await withConnectionLease({
          context,
          connectionId,
          task: () => syncAccountName(context, connectionId, desiredName),
        });
        return { updated, error: null };
      } catch (error) {
        return { updated: false, error };
      }
    },
  });
  const errors = results.flatMap((result) => result.error === null ? [] : [result.error]);
  if (errors.length > 0) {
    throw new AggregateError(errors, `目标账号名称同步失败: ${combinedMessage(errors)}`);
  }
  return results.filter((result) => result.updated).length;
}

async function syncAccountName(context: ConnectionContext, connectionId: string, desiredName: string) {
  const connection = await requiredConnection(context, connectionId);
  if (!managedActiveTarget(connection) || connection.targetAccountName === desiredName) return false;
  await context.remote.renameTargetAccount(connection.targetAccountId, desiredName);
  await context.store.setTargetAccount({
    id: connection.id,
    accountId: connection.targetAccountId,
    accountName: desiredName,
    at: context.now().toISOString(),
  });
  return true;
}

function managedActiveTarget(connection: RealConnection): connection is RealConnection & { readonly targetAccountId: number } {
  return connection.provisioningMode === "managed" && connection.status === "active"
    && connection.targetAccountId !== null && !connection.targetAccountDeleted;
}

async function createConnection(context: ConnectionContext, parsed: ParsedCreate) {
  try {
    return await withSourceGroupLease({
      context,
      siteId: parsed.sourceSiteId,
      groupId: parsed.sourceGroupId,
      task: () => createWithinGroupLease(context, parsed),
    });
  } catch (error) {
    if (!(error instanceof ConnectionBusyError)) throw error;
    const existing = await context.store.findByOperationId(parsed.operationId);
    if (!existing) throw error;
    validateRetry(existing, parsed);
    return toView(existing);
  }
}

async function createWithinGroupLease(context: ConnectionContext, parsed: ParsedCreate) {
  const retried = await context.store.findByOperationId(parsed.operationId);
  if (retried) return retryOperation(context, parsed, retried);
  const open = await context.store.findOpen(parsed.sourceSiteId, parsed.sourceGroupId);
  if (open) throw new ConnectionConflictError(`采集分组已存在未结束的真实连接: ${open.id}`);
  const connection = await prepareConnection(context, parsed);
  try {
    await context.store.insert(connection);
  } catch (error) {
    const duplicate = await context.store.findByOperationId(parsed.operationId);
    if (!duplicate) throw error;
    return retryOperation(context, parsed, duplicate);
  }
  return withConnectionLease({
    context,
    connectionId: connection.id,
    task: () => provisionConnection(context, connection.id),
  });
}

async function retryOperation(
  context: ConnectionContext,
  parsed: ParsedCreate,
  existing: RealConnection,
) {
  validateRetry(existing, parsed);
  if (existing.status === "active") return toView(existing);
  if (existing.lifecycleAction === "provision") {
    return withConnectionLease({
      context, connectionId: existing.id,
      task: () => provisionConnection(context, existing.id),
    });
  }
  const restartable = existing.status === "disconnected" && existing.lastError && resourcesGone(existing);
  if (!restartable) throw new ConnectionConflictError(`该幂等操作已处于 ${existing.status} 状态: ${existing.id}`);
  const prepared = await prepareConnection(context, parsed);
  await context.store.restartProvisioning(restartedConnection(existing, prepared));
  return withConnectionLease({
    context, connectionId: existing.id,
    task: () => provisionConnection(context, existing.id),
  });
}

async function disconnectWithLease(
  context: ConnectionContext,
  connectionId: string,
  request: ReturnType<typeof parseDisconnect>,
) {
  return withConnectionLease({
    context,
    connectionId,
    task: () => disconnectConnection(context, connectionId, request),
  });
}

async function listResourceOptions(
  context: ConnectionContext,
  input: ReturnType<typeof parseResourceOptions>,
) {
  const [sourceCredentials, targetAccounts] = await Promise.all([
    context.remote.listSourceCredentials(input.sourceSiteId),
    context.remote.listTargetAccounts(input.targetGroupIds),
  ]);
  return { sourceCredentials, targetAccounts };
}

async function reconcileConnections(context: ConnectionContext) {
  const results = await mapConcurrent({
    items: await context.store.listRecoverable(),
    concurrency: await context.concurrency(),
    task: (connection) => captureReconcile(context, connection.id),
  });
  const errors = results.filter((error): error is unknown => error !== null);
  if (errors.length > 0) throw new AggregateError(errors, "真实连接生命周期恢复失败");
}

async function captureReconcile(context: ConnectionContext, connectionId: string) {
  try {
    await withConnectionLease({
      context,
      connectionId,
      task: () => reconcileConnection(context, connectionId),
    });
    return null;
  } catch (error) {
    return error;
  }
}

async function reconcileConnection(context: ConnectionContext, connectionId: string) {
  const connection = await requiredConnection(context, connectionId);
  if (connection.lifecycleAction === "provision") {
    await provisionConnection(context, connectionId);
    return;
  }
  if (connection.lifecycleAction === "disconnect") {
    await resumeDisconnect(context, connectionId);
  }
}

function restartedConnection(existing: RealConnection, prepared: RealConnection): RealConnection {
  return {
    ...prepared,
    id: existing.id,
    operationId: existing.operationId,
    createdAt: existing.createdAt,
  };
}

function parseOptionalId(value: string | undefined) {
  return value === undefined ? undefined : parseConnectionId(value);
}

function positiveLimit(value: number) {
  return z.number().int().positive().parse(value);
}
