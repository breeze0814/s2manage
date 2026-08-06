import type { ConnectionContext } from "./context.ts";
import { ConnectionConflictError } from "./errors.ts";
import { beginLifecycle, beginStage, completeStage, failLifecycle } from "./lifecycle.ts";
import { requiredConnection, resourcesGone, toView } from "./model.ts";
import { mappedGroupIds } from "./resolution.ts";
import type { RealConnection } from "./types.ts";
import type { ParsedDisconnect } from "./validation.ts";

export async function disconnectConnection(
  context: ConnectionContext,
  connectionId: string,
  request: ParsedDisconnect,
) {
  const connection = await requiredConnection(context, connectionId);
  if (completedRequest(connection, request)) return toView(connection);
  validateRequest(connection, request);
  return executeDisconnect(context, connection, request);
}

export async function resumeDisconnect(context: ConnectionContext, connectionId: string) {
  const connection = await requiredConnection(context, connectionId);
  if (connection.lifecycleAction !== "disconnect") {
    throw new ConnectionConflictError(`真实连接没有待恢复的断开动作: ${connection.id}`);
  }
  return executeDisconnect(context, connection, {
    mode: connection.disconnectMode,
    removePricingMapping: connection.disconnectRemovePricing,
  });
}

async function executeDisconnect(
  context: ConnectionContext,
  connection: RealConnection,
  request: ParsedDisconnect,
) {
  await beginLifecycle(context, {
    connection,
    action: "disconnect",
    stage: "health",
    mode: request.mode,
    removePricing: request.removePricingMapping,
    message: "开始恢复真实连接断开流程",
  });
  try {
    await releaseHealth(context, connection.id);
    if (request.mode === "full") await deleteManagedResources(context, connection.id);
    await removePricing(context, connection.id, request.removePricingMapping);
    await context.store.finishDisconnect({ id: connection.id, error: null, at: context.now().toISOString() });
    await completeStage(context, stageEvent(connection.id, "complete", "真实连接断开完成"));
    return toView(await requiredConnection(context, connection.id));
  } catch (error) {
    await failLifecycle(context, connection.id, error);
    throw error;
  }
}

async function releaseHealth(context: ConnectionContext, connectionId: string) {
  await context.health.release(connectionId);
  await completeStage(context, stageEvent(connectionId, "health", "健康策略和调度所有权已释放"));
}

async function deleteManagedResources(context: ConnectionContext, connectionId: string) {
  await beginStage(context, stageEvent(connectionId, "remote", "删除托管远端资源"));
  await deleteTarget(context, connectionId);
  await deleteSource(context, connectionId);
  await completeStage(context, stageEvent(connectionId, "remote", "托管远端资源已删除"));
}

async function deleteTarget(context: ConnectionContext, connectionId: string) {
  const current = await requiredConnection(context, connectionId);
  if (current.targetAccountId === null || current.targetAccountDeleted) return;
  await context.remote.deleteTargetAccount(current.targetAccountId);
  await context.store.setResourceDeleted({
    id: connectionId, resource: "target", at: context.now().toISOString(),
  });
}

async function deleteSource(context: ConnectionContext, connectionId: string) {
  const current = await requiredConnection(context, connectionId);
  if (!current.sourceCredentialId || current.sourceCredentialDeleted) return;
  await context.remote.deleteSourceCredential(current.sourceSiteId, current.sourceCredentialId);
  await context.store.setResourceDeleted({
    id: connectionId, resource: "source", at: context.now().toISOString(),
  });
}

async function removePricing(
  context: ConnectionContext,
  connectionId: string,
  requested: boolean,
) {
  const connection = await requiredConnection(context, connectionId);
  if (!requested || !connection.pricingMappingEnabled) return;
  await beginStage(context, stageEvent(connectionId, "pricing", "移除调价映射"));
  const groups = await context.pricing.groups();
  const current = mappedGroupIds(groups, connection.sourceSiteId, connection.sourceGroupId);
  const removed = new Set(connection.targetGroupIds);
  await context.pricing.save({
    sourceSiteId: connection.sourceSiteId,
    sourceGroupId: connection.sourceGroupId,
    targetGroupIds: current.filter((id) => !removed.has(id)),
  });
  await context.store.setPricingMapping({ id: connectionId, enabled: false, at: context.now().toISOString() });
  await completeStage(context, stageEvent(connectionId, "pricing", "调价映射已移除"));
}

function validateRequest(connection: RealConnection, request: ParsedDisconnect) {
  if (request.mode === "full" && connection.provisioningMode !== "managed") {
    throw new ConnectionConflictError("现有资源绑定不允许自动删除远端资源");
  }
  if (connection.lifecycleAction !== "disconnect") return;
  const sameRequest = connection.disconnectMode === request.mode
    && connection.disconnectRemovePricing === request.removePricingMapping;
  if (!sameRequest) throw new ConnectionConflictError("真实连接已有不同参数的断开动作执行中");
}

function completedRequest(connection: RealConnection, request: ParsedDisconnect) {
  if (connection.status !== "disconnected") return false;
  if (request.mode === "unlink") return true;
  return resourcesGone(connection);
}

function stageEvent(
  connectionId: string,
  stage: RealConnection["lifecycleStage"],
  message: string,
) {
  return { connectionId, action: "disconnect" as const, stage, message };
}
