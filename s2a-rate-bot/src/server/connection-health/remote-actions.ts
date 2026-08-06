import type { RealConnection } from "../connections/types.ts";
import type { HealthContext } from "./context.ts";
import { HealthPolicyConflictError } from "./errors.ts";
import { withScheduleLease } from "./lease.ts";
import type { ConnectionHealthActionState } from "./types.ts";

export type ScheduleRelease = Readonly<{
  result: "success" | "failure" | "info";
  message: string;
}>;

export async function applyManagedSchedule(
  context: HealthContext,
  connection: RealConnection,
  schedulable: boolean,
) {
  const accountId = requiredTargetAccount(connection);
  return withScheduleLease({
    context,
    accountId,
    task: () => executeManagedSchedule(context, connection, schedulable),
  });
}

async function executeManagedSchedule(
  context: HealthContext,
  connection: RealConnection,
  schedulable: boolean,
) {
  const accountId = requiredTargetAccount(connection);
  const remoteValue = await context.gateway.readSchedulable(accountId);
  await context.gateway.assertSchedulableControl(accountId);
  const state = await claimOrRead({ context, connectionId: connection.id, accountId, remoteValue });
  const reconciled = await reconcilePending(context, state, remoteValue);
  await assertRemoteUnchanged(context, reconciled, remoteValue);
  await commitSchedule({ context, state: reconciled, schedulable, remoteValue });
}

export async function originalSchedule(context: HealthContext, connection: RealConnection) {
  const state = await context.store.actionState(connection.id);
  if (!state) throw new HealthPolicyConflictError("健康治理未持有该目标账号的调度状态");
  return state.originalSchedulable;
}

export async function releaseManagedSchedule(
  context: HealthContext,
  connection: RealConnection,
): Promise<ScheduleRelease | null> {
  const accountId = (await context.store.actionState(connection.id))?.accountId;
  if (accountId === undefined) return null;
  return withScheduleLease({
    context,
    accountId,
    task: () => executeRelease(context, connection),
  });
}

async function executeRelease(
  context: HealthContext,
  connection: RealConnection,
): Promise<ScheduleRelease | null> {
  const state = await context.store.actionState(connection.id);
  if (!state) return null;
  if (connection.targetAccountId === null || connection.targetAccountDeleted) {
    await context.store.deleteActionState(connection.id);
    return { result: "info", message: "目标账号已删除，已释放健康治理所有权" };
  }
  const remoteValue = await context.gateway.readSchedulable(state.accountId);
  const applied = releaseAppliedValue(state, remoteValue);
  if (applied === null) return releaseExternalChange(context, state);
  if (remoteValue !== state.originalSchedulable) {
    await restoreOriginalSchedule(context, state, remoteValue);
  }
  await context.store.deleteActionState(connection.id);
  return { result: "success", message: "已恢复接管前调度状态并释放健康治理所有权" };
}

async function claimOrRead(input: Readonly<{
  context: HealthContext;
  connectionId: string;
  accountId: number;
  remoteValue: boolean;
}>) {
  const existing = await input.context.store.actionState(input.connectionId);
  if (existing) {
    if (existing.accountId !== input.accountId) throw new HealthPolicyConflictError("真实连接的目标账号已发生变化");
    if (existing.conflict) throw new HealthPolicyConflictError("目标账号调度状态存在未解决的外部修改冲突");
    return existing;
  }
  const owner = await input.context.store.actionStateByAccount(input.accountId);
  if (owner) throw new HealthPolicyConflictError(`目标账号已由连接 ${owner.connectionId} 接管调度状态`);
  const state = actionState({ ...input, updatedAt: input.context.now().toISOString() });
  try {
    await input.context.store.saveActionState(state);
  } catch (error) {
    throw new HealthPolicyConflictError("目标账号调度状态已被其他连接接管", { cause: error });
  }
  return state;
}

async function reconcilePending(
  context: HealthContext,
  state: ConnectionHealthActionState,
  remoteValue: boolean,
) {
  if (state.pendingSchedulable === null) return state;
  if (remoteValue === state.pendingSchedulable) {
    const applied = updatedState({ context, state, lastAppliedSchedulable: remoteValue, pendingSchedulable: null, conflict: false });
    await context.store.saveActionState(applied);
    return applied;
  }
  if (remoteValue === state.lastAppliedSchedulable) return state;
  await markConflict(context, state);
  throw new HealthPolicyConflictError("目标账号在健康动作提交期间被外部修改");
}

async function assertRemoteUnchanged(
  context: HealthContext,
  state: ConnectionHealthActionState,
  remoteValue: boolean,
) {
  if (remoteValue === state.lastAppliedSchedulable) return;
  await markConflict(context, state);
  throw new HealthPolicyConflictError("目标账号调度状态已被外部修改");
}

async function commitSchedule(input: Readonly<{
  context: HealthContext;
  state: ConnectionHealthActionState;
  schedulable: boolean;
  remoteValue: boolean;
}>) {
  if (input.remoteValue === input.schedulable) {
    await input.context.store.saveActionState(updatedState({
      ...input, lastAppliedSchedulable: input.schedulable,
      pendingSchedulable: null, conflict: false,
    }));
    return;
  }
  await input.context.store.saveActionState(updatedState({
    ...input, lastAppliedSchedulable: input.state.lastAppliedSchedulable,
    pendingSchedulable: input.schedulable, conflict: false,
  }));
  await input.context.gateway.setSchedulable(input.state.accountId, input.schedulable);
  await input.context.store.saveActionState(updatedState({
    ...input, lastAppliedSchedulable: input.schedulable,
    pendingSchedulable: null, conflict: false,
  }));
}

function releaseAppliedValue(state: ConnectionHealthActionState, remoteValue: boolean) {
  if (state.pendingSchedulable === null) {
    return remoteValue === state.lastAppliedSchedulable ? state.lastAppliedSchedulable : null;
  }
  if (remoteValue === state.pendingSchedulable) return state.pendingSchedulable;
  return remoteValue === state.lastAppliedSchedulable ? state.lastAppliedSchedulable : null;
}

async function releaseExternalChange(context: HealthContext, state: ConnectionHealthActionState): Promise<ScheduleRelease> {
  await context.store.deleteActionState(state.connectionId);
  return { result: "failure", message: "检测到外部调度状态变更，未覆盖远端状态并已释放健康治理所有权" };
}

async function restoreOriginalSchedule(
  context: HealthContext,
  state: ConnectionHealthActionState,
  remoteValue: boolean,
) {
  await context.store.saveActionState(updatedState({
    context, state, lastAppliedSchedulable: remoteValue,
    pendingSchedulable: state.originalSchedulable, conflict: false,
  }));
  await context.gateway.setSchedulable(state.accountId, state.originalSchedulable);
}

async function markConflict(context: HealthContext, state: ConnectionHealthActionState) {
  await context.store.saveActionState(updatedState({
    context, state, lastAppliedSchedulable: state.lastAppliedSchedulable,
    pendingSchedulable: state.pendingSchedulable, conflict: true,
  }));
}

function updatedState(input: Readonly<{
  context: HealthContext;
  state: ConnectionHealthActionState;
  lastAppliedSchedulable: boolean;
  pendingSchedulable: boolean | null;
  conflict: boolean;
}>): ConnectionHealthActionState {
  return {
    ...input.state,
    lastAppliedSchedulable: input.lastAppliedSchedulable,
    pendingSchedulable: input.pendingSchedulable,
    conflict: input.conflict,
    updatedAt: input.context.now().toISOString(),
  };
}

function actionState(input: Readonly<{
  connectionId: string;
  accountId: number;
  remoteValue: boolean;
  updatedAt: string;
}>): ConnectionHealthActionState {
  return {
    connectionId: input.connectionId,
    accountId: input.accountId,
    originalSchedulable: input.remoteValue,
    lastAppliedSchedulable: input.remoteValue,
    pendingSchedulable: null,
    conflict: false,
    updatedAt: input.updatedAt,
  };
}

function requiredTargetAccount(connection: RealConnection) {
  if (connection.targetAccountId === null) throw new Error(`真实连接缺少目标账号: ${connection.id}`);
  return connection.targetAccountId;
}
