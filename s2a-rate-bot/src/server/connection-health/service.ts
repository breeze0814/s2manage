import { z } from "zod";
import type { RealConnection } from "../connections/types.ts";
import type { HealthContext } from "./context.ts";
import { actionEvent, policyEvent } from "./events.ts";
import { HealthPolicyConflictError } from "./errors.ts";
import { withConnectionLease } from "./lease.ts";
import { applyManualAction, probeConnection, runDueProbes } from "./probe.ts";
import { releaseManagedSchedule } from "./remote-actions.ts";
import { nextProbeAt } from "./state.ts";
import type {
  ConnectionHealthEvent, ConnectionHealthMonitor, ConnectionHealthPolicy,
  HealthProbeExecution,
} from "./types.ts";

export { HealthPolicyConflictError, HealthProbeError } from "./errors.ts";

const policySchema = z.object({
  name: z.string().trim().min(1, "策略名称不能为空"),
  enabled: z.boolean(),
  intervalSeconds: z.number().int().positive("探测间隔必须是正整数"),
  failureThreshold: z.number().int().positive("失败阈值必须是正整数"),
  recoveryThreshold: z.number().int().positive("恢复阈值必须是正整数"),
  autoSuspend: z.boolean(),
  autoRestore: z.boolean(),
});
const policyIdSchema = z.number().int().positive().nullable();
const actionSchema = z.enum(["suspend", "restore"]);
const connectionIdSchema = z.string().uuid("真实连接 ID 无效");

export type ConnectionHealthService = {
  readonly listPolicies: () => Promise<ConnectionHealthPolicy[]>;
  readonly createPolicy: (input: unknown) => Promise<ConnectionHealthPolicy>;
  readonly updatePolicy: (id: number, input: unknown) => Promise<ConnectionHealthPolicy>;
  readonly deletePolicy: (id: number) => Promise<void>;
  readonly listMonitors: () => Promise<ConnectionHealthMonitor[]>;
  readonly assign: (connectionId: string, policyId: unknown) => Promise<ConnectionHealthMonitor | null>;
  readonly probe: (connectionId: string) => Promise<HealthProbeExecution>;
  readonly act: (connectionId: string, action: unknown) => Promise<ConnectionHealthMonitor>;
  readonly events: (connectionId?: string, limit?: number) => Promise<ConnectionHealthEvent[]>;
  readonly eventPage: (connectionId?: string, limit?: number, beforeId?: number) => Promise<ReturnType<HealthContext["store"]["eventPage"]>>;
  readonly nextDueAt: () => Promise<string | null>;
  readonly runDue: () => Promise<boolean>;
};

export function createConnectionHealthService(context: HealthContext): ConnectionHealthService {
  return {
    listPolicies: async () => context.store.listPolicies(),
    createPolicy: (raw) => createPolicy(context, raw),
    updatePolicy: (id, raw) => updatePolicy(context, id, raw),
    deletePolicy: (id) => deletePolicy(context, id),
    listMonitors: async () => context.store.listMonitors(),
    assign: (id, policyId) => assignPolicy(context, id, policyId),
    probe: (id) => probeConnection(context, connectionIdSchema.parse(id)),
    act: (id, action) => applyManualAction(context, connectionIdSchema.parse(id), actionSchema.parse(action)),
    events: async (id, limit = 100) => context.store.eventPage({
      connectionId: parseOptionalConnectionId(id), limit: positiveLimit(limit),
    }).events.slice(),
    eventPage: async (id, limit = 50, beforeId) => context.store.eventPage({
      connectionId: parseOptionalConnectionId(id),
      limit: positiveLimit(limit),
      ...(beforeId === undefined ? {} : { beforeId: positiveId(beforeId) }),
    }),
    nextDueAt: async () => context.store.nextDueAt(),
    runDue: () => runDueProbes(context),
  };
}

async function createPolicy(context: HealthContext, raw: unknown) {
  return context.store.createPolicy(policySchema.parse(raw), context.now().toISOString());
}

async function updatePolicy(context: HealthContext, rawId: number, raw: unknown) {
  const id = positiveId(rawId);
  const policy = policySchema.parse(raw);
  const at = context.now();
  const dueAt = policy.enabled ? nextProbeAt(at, policy.intervalSeconds) : null;
  return context.store.updatePolicy({ id, policy, at: at.toISOString(), nextProbeAt: dueAt });
}

async function deletePolicy(context: HealthContext, rawId: number) {
  const id = positiveId(rawId);
  const count = context.store.assignmentCount(id);
  if (count > 0) throw new HealthPolicyConflictError(`健康策略仍被 ${count} 条连接使用`);
  context.store.deletePolicy(id);
}

async function assignPolicy(context: HealthContext, rawConnectionId: string, rawPolicyId: unknown) {
  const connectionId = connectionIdSchema.parse(rawConnectionId);
  const policyId = policyIdSchema.parse(rawPolicyId);
  return withConnectionLease({
    context,
    connectionId,
    task: () => executeAssignment(context, connectionId, policyId),
  });
}

async function executeAssignment(
  context: HealthContext,
  connectionId: string,
  policyId: number | null,
) {
  const connection = requiredConnection(context, connectionId);
  const monitor = context.store.monitor(connectionId);
  if (policyId === null) return removeAssignment(context, connection, monitor);
  if (connection.status !== "active") {
    throw new HealthPolicyConflictError(`真实连接当前状态不可分配健康策略: ${connection.status}`);
  }
  requiredPolicy(context, policyId);
  if (monitor?.policy?.id === policyId) return monitor;
  const at = context.now().toISOString();
  context.store.assign(connection.id, policyId, at);
  context.store.appendEvent(policyEvent(connection.id, policyId, at));
  return requiredMonitor(context, connection.id);
}

async function removeAssignment(
  context: HealthContext,
  connection: RealConnection,
  monitor: ConnectionHealthMonitor | null,
) {
  const owned = context.store.actionState(connection.id);
  if (!monitor && !owned) return null;
  const release = await releaseManagedSchedule(context, connection);
  if (release) appendReleaseEvent(context, connection.id, monitor, release);
  const at = context.now().toISOString();
  context.store.assign(connection.id, null, at);
  context.store.appendEvent(policyEvent(connection.id, null, at));
  return null;
}

function appendReleaseEvent(
  context: HealthContext,
  connectionId: string,
  monitor: ConnectionHealthMonitor | null,
  release: Awaited<ReturnType<typeof releaseManagedSchedule>> & {},
) {
  const state = monitor?.state ?? "unknown";
  context.store.appendEvent(actionEvent({
    connectionId,
    fromState: state,
    toState: state,
    message: release.message,
    result: release.result,
    at: context.now().toISOString(),
  }));
}

function requiredConnection(context: HealthContext, id: string) {
  const connection = context.connections.get(id);
  if (!connection) throw new Error(`真实连接不存在: ${id}`);
  return connection;
}

function requiredPolicy(context: HealthContext, id: number) {
  const policy = context.store.getPolicy(id);
  if (!policy) throw new Error(`健康策略不存在: ${id}`);
  return policy;
}

function requiredMonitor(context: HealthContext, connectionId: string) {
  const monitor = context.store.monitor(connectionId);
  if (!monitor) throw new HealthPolicyConflictError("真实连接尚未分配健康策略");
  return monitor;
}

function parseOptionalConnectionId(value: string | undefined) {
  return value === undefined ? undefined : connectionIdSchema.parse(value);
}

function positiveId(value: number) {
  return z.number().int().positive().parse(value);
}

function positiveLimit(value: number) {
  return z.number().int().positive().parse(value);
}
