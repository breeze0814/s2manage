import type { ConnectionContext } from "./context.ts";
import type { ConnectionView, RealConnection } from "./types.ts";

const RESOURCE_NAME_LIMIT = 80;
const ERROR_MESSAGE_LIMIT = 1_000;

export function requiredConnection(context: ConnectionContext, id: string) {
  const connection = context.store.get(id);
  if (!connection) throw new Error(`真实连接不存在: ${id}`);
  return connection;
}

export function ensureResourceName(context: ConnectionContext, connection: RealConnection) {
  if (connection.resourceName) return connection.resourceName;
  const raw = `s2a-${connection.sourceSiteName}-${connection.sourceGroupName}-${connection.id.slice(0, 8)}`;
  const resourceName = raw.replace(/\s+/g, "-").slice(0, RESOURCE_NAME_LIMIT);
  context.store.setResourceName({ id: connection.id, resourceName, at: context.now().toISOString() });
  return resourceName;
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
