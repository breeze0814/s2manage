import type { ConnectionContext } from "./context.ts";
import { ConnectionConflictError } from "./errors.ts";
import {
  resolveExistingResources, validateExistingRetry, validateStoredResources,
} from "./existing-resources.ts";
import { beginLifecycle, beginStage, completeStage, failLifecycle } from "./lifecycle.ts";
import { buildResourceName, ensureResourceName, requiredConnection, toView } from "./model.ts";
import {
  mappedGroupIds, resolveRequest, resolveStored, type ResolvedConnectionContext,
} from "./resolution.ts";
import type {
  ConnectionTargetGroup, ExistingSourceCredential, ExistingTargetAccount, RealConnection,
} from "./types.ts";
import type { ParsedCreate } from "./validation.ts";

export async function prepareConnection(context: ConnectionContext, parsed: ParsedCreate) {
  const resolved = await resolveRequest(context, parsed);
  const resources = parsed.mode === "existing"
    ? await resolveExistingResources(context, parsed)
    : null;
  return initialConnection({ context, parsed, resolved, resources });
}

export async function provisionConnection(context: ConnectionContext, connectionId: string) {
  const initial = await requiredConnection(context, connectionId);
  await beginLifecycle(context, {
    connection: initial,
    action: "provision",
    stage: "metadata",
    mode: initial.disconnectMode,
    removePricing: initial.disconnectRemovePricing,
    message: "开始恢复真实连接创建流程",
  });
  try {
    const resolved = await resolveStored(context, await requiredConnection(context, connectionId));
    await provisionMetadata(context, await requiredConnection(context, connectionId));
    if (initial.provisioningMode === "managed") {
      await provisionManagedResources(context, await requiredConnection(context, connectionId), resolved);
    } else {
      await validateStoredResources(context, await requiredConnection(context, connectionId));
    }
    await provisionPricing(context, await requiredConnection(context, connectionId), resolved.groups);
    await context.store.finishProvision({ id: connectionId, error: null, at: context.now().toISOString() });
    await completeStage(context, completeEvent(connectionId, "真实连接创建完成"));
    return toView(await requiredConnection(context, connectionId));
  } catch (error) {
    await failLifecycle(context, connectionId, error);
    throw error;
  }
}

export function validateRetry(connection: RealConnection, parsed: ParsedCreate) {
  const targets = [...connection.targetGroupIds].sort((left, right) => left - right);
  const requested = [...parsed.targetGroupIds].sort((left, right) => left - right);
  const sameTargets = targets.length === requested.length
    && targets.every((id, index) => id === requested[index]);
  const matches = connection.sourceSiteId === parsed.sourceSiteId
    && connection.sourceGroupId === parsed.sourceGroupId
    && connection.groupType === parsed.groupType
    && connection.provisioningMode === parsed.mode
    && connection.pricingMappingRequested === parsed.addToPricingMapping
    && sameTargets;
  if (!matches) throw new ConnectionConflictError(`幂等操作参数与原始请求不一致: ${connection.id}`);
  if (parsed.mode === "existing") validateExistingRetry(connection, parsed);
}

async function provisionMetadata(context: ConnectionContext, connection: RealConnection) {
  await context.sources.setGroupType(connection.sourceSiteId, connection.sourceGroupId, connection.groupType);
  await completeStage(context, stageEvent(connection.id, "metadata", "采集分组元数据已同步"));
}

async function provisionManagedResources(
  context: ConnectionContext,
  connection: RealConnection,
  resolved: ResolvedConnectionContext,
) {
  const name = await ensureResourceName(context, connection);
  await beginStage(context, stageEvent(connection.id, "source", "确保采集站凭据存在"));
  const credential = await context.remote.ensureSourceCredential({
    siteId: connection.sourceSiteId, groupId: connection.sourceGroupId, name,
  });
  assertResourceId(connection.sourceCredentialId, credential.id, "采集站凭据");
  await context.store.setSourceCredential({ id: connection.id, credentialId: credential.id, at: context.now().toISOString() });
  await completeStage(context, stageEvent(connection.id, "source", "采集站凭据已确认"));
  await provisionTarget(context, {
    connection: await requiredConnection(context, connection.id), resolved, apiKey: credential.key, name,
  });
}

async function provisionTarget(context: ConnectionContext, input: Readonly<{
  connection: RealConnection;
  resolved: ResolvedConnectionContext;
  apiKey: string;
  name: string;
}>) {
  const { connection } = input;
  await beginStage(context, stageEvent(connection.id, "target", "确保目标转发账号存在"));
  const target = await context.remote.ensureTargetAccount({
    name: input.name, sourceBaseUrl: input.resolved.site.baseUrl, apiKey: input.apiKey,
    groupType: connection.groupType, targetGroupIds: connection.targetGroupIds,
  });
  if (connection.targetAccountId !== null) assertResourceId(String(connection.targetAccountId), String(target.id), "目标账号");
  await context.store.setTargetAccount({
    id: connection.id, accountId: target.id, accountName: target.name, at: context.now().toISOString(),
  });
  await completeStage(context, stageEvent(connection.id, "target", "目标转发账号已确认"));
}

async function provisionPricing(
  context: ConnectionContext,
  connection: RealConnection,
  groups: readonly ConnectionTargetGroup[],
) {
  await beginStage(context, stageEvent(connection.id, "pricing", "同步调价映射"));
  if (connection.pricingMappingRequested) {
    const current = mappedGroupIds(groups, connection.sourceSiteId, connection.sourceGroupId);
    const targetGroupIds = [...new Set([...current, ...connection.targetGroupIds])];
    await context.pricing.save({
      sourceSiteId: connection.sourceSiteId,
      sourceGroupId: connection.sourceGroupId,
      targetGroupIds,
    });
    await context.store.setPricingMapping({ id: connection.id, enabled: true, at: context.now().toISOString() });
  }
  await completeStage(context, stageEvent(connection.id, "pricing", "调价映射同步完成"));
}

function initialConnection(input: Readonly<{
  context: ConnectionContext;
  parsed: ParsedCreate;
  resolved: ResolvedConnectionContext;
  resources: ExistingResources | null;
}>): RealConnection {
  const { context, parsed, resolved, resources } = input;
  const timestamp = context.now().toISOString();
  return {
    id: context.id(), operationId: parsed.operationId,
    sourceSiteId: resolved.site.id, sourceSiteName: resolved.site.name,
    sourceGroupId: resolved.rate.groupId, sourceGroupName: resolved.rate.groupName,
    sourcePlatform: resolved.site.siteType, sourceCredentialId: resources?.source.id ?? "",
    targetAccountId: resources?.target.id ?? null, targetAccountName: resources?.target.name ?? "",
    targetGroupIds: resolved.targetGroups.map((group) => group.id),
    targetGroupNames: resolved.targetGroups.map((group) => group.name),
    groupType: parsed.groupType,
    resourceName: parsed.mode === "managed" ? buildResourceName({
      sourceSiteName: resolved.site.name,
      sourceGroupName: resolved.rate.groupName,
      effectiveRate: resolved.rate.effectiveRate,
    }) : "",
    provisioningMode: parsed.mode,
    status: "provisioning", pricingMappingEnabled: false,
    pricingMappingRequested: parsed.addToPricingMapping,
    sourceCredentialDeleted: false, targetAccountDeleted: false,
    lifecycleAction: "provision", lifecycleStage: "metadata",
    disconnectMode: "unlink", disconnectRemovePricing: true,
    lastError: null, createdAt: timestamp, updatedAt: timestamp, disconnectedAt: null,
  };
}

function assertResourceId(stored: string, actual: string, label: string) {
  if (stored && stored !== actual) throw new ConnectionConflictError(`${label}确定名称回查到不同资源: ${actual}`);
}

function stageEvent(
  connectionId: string,
  stage: RealConnection["lifecycleStage"],
  message: string,
) {
  return { connectionId, action: "provision" as const, stage, message };
}

function completeEvent(connectionId: string, message: string) {
  return stageEvent(connectionId, "complete", message);
}

type ExistingResources = Readonly<{
  source: ExistingSourceCredential;
  target: ExistingTargetAccount;
}>;
