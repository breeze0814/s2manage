import { mapConcurrent } from "../concurrency.ts";
import type { RealConnection } from "../connections/types.ts";
import { actionEvent, errorMessage, probeEvent, type ProbeResult } from "./events.ts";
import type { HealthContext } from "./context.ts";
import { HealthPolicyConflictError, HealthProbeError } from "./errors.ts";
import { trySchedulerLease, withConnectionLease } from "./lease.ts";
import { applyManagedSchedule, originalSchedule } from "./remote-actions.ts";
import { probeState, requiredMonitorPolicy, retryableActionState } from "./state.ts";
import type {
  ConnectionHealthMonitor, ConnectionHealthState, ConnectionHealthStateName,
  HealthProbeExecution,
} from "./types.ts";

export async function probeConnection(context: HealthContext, connectionId: string) {
  return withConnectionLease({
    context,
    connectionId,
    task: () => executeProbe(context, connectionId),
  });
}

export async function applyManualAction(
  context: HealthContext,
  connectionId: string,
  action: "suspend" | "restore",
) {
  return withConnectionLease({
    context,
    connectionId,
    task: () => executeManualAction(context, connectionId, action),
  });
}

export async function runDueProbes(context: HealthContext) {
  return trySchedulerLease({ context, task: () => executeDueProbes(context) });
}

async function executeProbe(context: HealthContext, connectionId: string) {
  const connection = activeConnection(context, connectionId);
  const monitor = requiredMonitor(context, connection.id);
  const accountId = requiredTargetAccount(connection);
  const startedAt = Date.now();
  let result: ProbeResult;
  try {
    const response = await context.gateway.probe(accountId);
    result = {
      success: response.success, message: response.message,
      latencyMs: response.latencyMs, model: response.model ?? null,
    };
  } catch (error) {
    result = {
      success: false,
      message: errorMessage(error),
      latencyMs: Date.now() - startedAt,
      model: null,
    };
    const execution = await recordProbe(context, { connection, monitor, result });
    throw new HealthProbeError(errorMessage(error), execution, { cause: error });
  }
  return recordProbe(context, { connection, monitor, result });
}

async function recordProbe(context: HealthContext, input: ProbeRecord): Promise<HealthProbeExecution> {
  const at = context.now();
  const state = probeState(input.monitor, input.result, at);
  let action: AutomaticAction | null;
  try {
    action = await applyAutomaticAction(context, { ...input, state });
  } catch (error) {
    const retryable = retryableActionState(state);
    context.store.saveStateAndEvent(retryable, probeEvent({
      monitor: input.monitor, state: retryable, result: input.result, at: at.toISOString(),
    }));
    throw error;
  }
  context.store.saveStateAndEvent(state, probeEvent({
    monitor: input.monitor, state, result: input.result, at: at.toISOString(),
  }));
  if (action) appendAction(context, {
    connectionId: input.connection.id, fromState: input.monitor.state,
    toState: state.state, message: action.message, result: "success",
  });
  return {
    monitor: requiredMonitor(context, input.connection.id),
    success: input.result.success,
    message: input.result.message,
  };
}

async function applyAutomaticAction(context: HealthContext, input: AutomaticActionInput) {
  const policy = requiredMonitorPolicy(input.monitor);
  if (input.state.suspensionReason === "automatic"
    && input.monitor.suspensionReason !== "automatic" && policy.autoSuspend) {
    return runScheduleAction(context, {
      connection: input.connection,
      fromState: input.monitor.state,
      toState: input.state.state,
      schedulable: false,
      message: "连续探测失败，已自动暂停调度",
    });
  }
  if (input.state.state !== "healthy" || input.monitor.suspensionReason !== "automatic" || !policy.autoRestore) return null;
  const schedulable = originalSchedule(context, input.connection);
  const message = schedulable ? "恢复探测达标，已恢复接管前调度状态" : "恢复探测达标，接管前状态为不可调度";
  return runScheduleAction(context, {
    connection: input.connection,
    fromState: input.monitor.state,
    toState: input.state.state,
    schedulable,
    message,
  });
}

async function executeManualAction(
  context: HealthContext,
  connectionId: string,
  action: "suspend" | "restore",
) {
  const connection = activeConnection(context, connectionId);
  const monitor = requiredMonitor(context, connection.id);
  const schedulable = action === "restore" ? originalSchedule(context, connection) : false;
  const nextState = action === "restore" ? "observing" : "suspended";
  const message = manualActionMessage(action, schedulable);
  await executeSchedule(context, {
    connection, fromState: monitor.state, toState: nextState, schedulable, message,
  });
  const state = manualState(context, {
    monitor, state: nextState, suspensionReason: action === "suspend" ? "manual" : null,
  });
  context.store.saveStateAndEvent(state, actionEvent({
    connectionId, fromState: monitor.state, toState: nextState,
    message, result: "success", at: state.updatedAt,
  }));
  return requiredMonitor(context, connection.id);
}

async function runScheduleAction(context: HealthContext, input: ScheduleInput): Promise<AutomaticAction> {
  await executeSchedule(context, input);
  return { message: input.message };
}

async function executeSchedule(context: HealthContext, input: ScheduleInput) {
  try {
    await applyManagedSchedule(context, input.connection, input.schedulable);
  } catch (error) {
    appendAction(context, {
      connectionId: input.connection.id,
      fromState: input.fromState,
      toState: input.toState,
      message: errorMessage(error),
      result: "failure",
    });
    throw error;
  }
}

async function executeDueProbes(context: HealthContext) {
  const activeIds = new Set(context.connections.list()
    .filter((connection) => connection.status === "active")
    .map((connection) => connection.id));
  const due = context.store.listDue(context.now().toISOString())
    .filter((monitor) => activeIds.has(monitor.connectionId));
  const results = await mapConcurrent({
    items: due,
    concurrency: await context.concurrency(),
    task: async (monitor) => captureProbe(context, monitor.connectionId),
  });
  const errors = results.filter((error): error is unknown => error !== null);
  if (errors.length > 0) throw new AggregateError(errors, "连接健康定时探测失败");
}

async function captureProbe(context: HealthContext, connectionId: string) {
  try {
    await probeConnection(context, connectionId);
    return null;
  } catch (error) {
    return error;
  }
}

function manualState(context: HealthContext, input: ManualStateInput): ConnectionHealthState {
  const at = context.now().toISOString();
  const { policy: _policy, ...current } = input.monitor;
  return {
    ...current,
    state: input.state,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    nextProbeAt: input.state === "observing" ? at : input.monitor.nextProbeAt,
    suspensionReason: input.suspensionReason,
    updatedAt: at,
  };
}

function appendAction(context: HealthContext, input: ActionEventInput) {
  context.store.appendEvent(actionEvent({
    ...input,
    at: context.now().toISOString(),
  }));
}

function activeConnection(context: HealthContext, id: string) {
  const connection = context.connections.get(id);
  if (!connection) throw new Error(`真实连接不存在: ${id}`);
  if (connection.status !== "active") {
    throw new HealthPolicyConflictError(`真实连接当前状态不可探测: ${connection.status}`);
  }
  return connection;
}

function requiredMonitor(context: HealthContext, connectionId: string) {
  const monitor = context.store.monitor(connectionId);
  if (!monitor) throw new HealthPolicyConflictError("真实连接尚未分配健康策略");
  return monitor;
}

function requiredTargetAccount(connection: RealConnection) {
  if (connection.targetAccountId === null) throw new Error(`真实连接缺少目标账号: ${connection.id}`);
  return connection.targetAccountId;
}

function manualActionMessage(action: "suspend" | "restore", schedulable: boolean) {
  if (action === "suspend") return "已人工暂停调度";
  return schedulable ? "已恢复接管前调度状态并进入观察期" : "接管前状态为不可调度，已进入观察期";
}

type AutomaticAction = Readonly<{ message: string }>;
type ProbeRecord = Readonly<{
  connection: RealConnection;
  monitor: ConnectionHealthMonitor;
  result: ProbeResult;
}>;
type AutomaticActionInput = ProbeRecord & Readonly<{ state: ConnectionHealthState }>;
type ScheduleInput = Readonly<{
  connection: RealConnection;
  fromState: ConnectionHealthStateName;
  toState: ConnectionHealthStateName;
  schedulable: boolean;
  message: string;
}>;
type ManualStateInput = Readonly<{
  monitor: ConnectionHealthMonitor;
  state: ConnectionHealthStateName;
  suspensionReason: ConnectionHealthState["suspensionReason"];
}>;
type ActionEventInput = Readonly<{
  connectionId: string;
  fromState: ConnectionHealthStateName;
  toState: ConnectionHealthStateName;
  message: string;
  result: "success" | "failure" | "info";
}>;
