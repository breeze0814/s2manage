import type { ConnectionContext } from "./context.ts";
import type { ConnectionView, RealConnection } from "./types.ts";

const RESOURCE_NAME_LIMIT = 80;
const ERROR_MESSAGE_LIMIT = 1_000;

export async function requiredConnection(context: ConnectionContext, id: string) {
  const connection = await context.store.get(id);
  if (!connection) throw new Error(`真实连接不存在: ${id}`);
  return connection;
}

export async function ensureResourceName(context: ConnectionContext, connection: RealConnection) {
  if (connection.resourceName) return connection.resourceName;
  const rate = (await context.sources.rates()).find((item) => (
    item.sourceSiteId === connection.sourceSiteId && item.groupId === connection.sourceGroupId && !item.deleted
  ));
  if (!rate) throw new Error(`采集分组不存在: ${connection.sourceSiteId}:${connection.sourceGroupId}`);
  const resourceName = buildResourceName({
    sourceSiteName: connection.sourceSiteName,
    sourceGroupName: connection.sourceGroupName,
    effectiveRate: rate.effectiveRate,
  });
  await context.store.setResourceName({ id: connection.id, resourceName, at: context.now().toISOString() });
  return resourceName;
}

export function buildResourceName(input: Readonly<{
  sourceSiteName: string;
  sourceGroupName: string;
  effectiveRate: number;
}>) {
  if (!Number.isFinite(input.effectiveRate)) throw new Error("采集分组有效倍率无效");
  const rate = Number(input.effectiveRate.toFixed(4)).toString();
  const suffix = `-${rate}`;
  const label = `${input.sourceSiteName.trim()}-${input.sourceGroupName.trim()}`.replace(/\s+/g, "-");
  return `${label.slice(0, RESOURCE_NAME_LIMIT - suffix.length)}${suffix}`;
}

export function resourcesGone(connection: RealConnection) {
  const targetGone = connection.targetAccountId === null || connection.targetAccountDeleted;
  const sourceGone = !connection.sourceCredentialId || connection.sourceCredentialDeleted;
  return targetGone && sourceGone;
}

export function toView(connection: RealConnection): ConnectionView {
  const { operationId: _operationId, ...view } = connection;
  return {
    ...view,
    connected: connection.status === "active",
    canDeleteRemote: connection.provisioningMode === "managed" && !resourcesGone(connection),
  };
}

export function combinedMessage(errors: readonly unknown[]) {
  return errors.map(errorMessage).join(" | ").slice(0, ERROR_MESSAGE_LIMIT);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalize(value: string) {
  return value.trim().toLowerCase();
}
