import { execute, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { LifecycleEventQuery } from "./event-store.ts";
import { insertPostgresLifecycleEvent, readPostgresLifecycleEventPage } from "./postgres-event-store.ts";
import type { BooleanChange, CompletionChange, ConnectionStore, LifecycleChange, ResourceDeletedChange,
  ResourceNameChange, SourceCredentialChange, StageChange, TargetAccountChange } from "./store.ts";
import type { RealConnection } from "./types.ts";

export function createPostgresConnectionStore(context: PostgresContext): ConnectionStore {
  return {
    get: (id) => readOne(context, "id", id),
    findByOperationId: (id) => readOne(context, "operation_id", id),
    findOpen: (siteId, groupId) => findOpen(context, siteId, groupId),
    list: async () => (await rows<Record<string, unknown>>(context,
      "SELECT * FROM real_connections ORDER BY created_at DESC,id DESC")).map(mapConnection),
    listRecoverable: async () => (await rows<Record<string, unknown>>(context, `SELECT * FROM real_connections
      WHERE lifecycle_action IS NOT NULL AND status IN ('provisioning','disconnecting','error')
      ORDER BY updated_at,id`)).map(mapConnection),
    insert: (connection) => insertConnection(context, connection),
    restartProvisioning: (connection) => restartProvisioning(context, connection),
    setResourceName: (change) => updateOne(context, "UPDATE real_connections SET resource_name=$2,updated_at=$3 WHERE id=$1",
      [change.id, change.resourceName, change.at]),
    setSourceCredential: (change) => setSourceCredential(context, change),
    setTargetAccount: (change) => setTargetAccount(context, change),
    setPricingMapping: (change) => setPricingMapping(context, change),
    setLifecycle: (change) => setLifecycle(context, change),
    setStage: (change) => setStage(context, change),
    setResourceDeleted: (change) => setResourceDeleted(context, change),
    finishProvision: (change) => finishProvision(context, change),
    finishDisconnect: (change) => finishDisconnect(context, change),
    appendEvent: (event) => insertPostgresLifecycleEvent(context, event),
    eventPage: (query: LifecycleEventQuery) => readPostgresLifecycleEventPage(context, query),
    close: async () => undefined,
  };
}

async function readOne(context: PostgresContext, column: "id" | "operation_id", value: string) {
  const found = await row<Record<string, unknown>>(context, `SELECT * FROM real_connections WHERE ${column}=$1`, [value]);
  return found ? mapConnection(found) : null;
}

async function findOpen(context: PostgresContext, siteId: number, groupId: string) {
  const found = await row<Record<string, unknown>>(context, `SELECT * FROM real_connections
    WHERE source_site_id=$1 AND source_group_id=$2
      AND status IN ('provisioning','active','disconnecting','error')`, [siteId, groupId]);
  return found ? mapConnection(found) : null;
}

async function insertConnection(context: PostgresContext, value: RealConnection) {
  await execute(context, `INSERT INTO real_connections
    (id,operation_id,source_site_id,source_site_name,source_group_id,source_group_name,source_platform,
      source_credential_id,target_account_id,target_account_name,target_group_ids_json,target_group_names_json,
      group_type,resource_name,provisioning_mode,status,pricing_mapping_enabled,pricing_mapping_requested,
      source_credential_deleted,target_account_deleted,lifecycle_action,lifecycle_stage,disconnect_mode,
      disconnect_remove_pricing,last_error,created_at,updated_at,disconnected_at)
    VALUES (${placeholders(28)})`, connectionValues(value));
}

async function restartProvisioning(context: PostgresContext, value: RealConnection) {
  await updateOne(context, `UPDATE real_connections SET source_site_name=$2,source_group_name=$3,
    source_platform=$4,source_credential_id=$5,target_account_id=$6,target_account_name=$7,
    target_group_ids_json=$8,target_group_names_json=$9,group_type=$10,resource_name=$11,
    provisioning_mode=$12,status='provisioning',pricing_mapping_enabled=0,pricing_mapping_requested=$13,
    source_credential_deleted=0,target_account_deleted=0,lifecycle_action='provision',lifecycle_stage='metadata',
    last_error=NULL,updated_at=$14,disconnected_at=NULL WHERE id=$1`, [value.id, value.sourceSiteName,
    value.sourceGroupName, value.sourcePlatform, value.sourceCredentialId, value.targetAccountId,
    value.targetAccountName, JSON.stringify(value.targetGroupIds), JSON.stringify(value.targetGroupNames),
    value.groupType, value.resourceName, value.provisioningMode, flag(value.pricingMappingRequested), value.updatedAt]);
}

function setSourceCredential(context: PostgresContext, change: SourceCredentialChange) {
  return updateOne(context, "UPDATE real_connections SET source_credential_id=$2,updated_at=$3 WHERE id=$1",
    [change.id, change.credentialId, change.at]);
}

function setTargetAccount(context: PostgresContext, change: TargetAccountChange) {
  return updateOne(context, `UPDATE real_connections SET target_account_id=$2,target_account_name=$3,updated_at=$4
    WHERE id=$1`, [change.id, change.accountId, change.accountName, change.at]);
}

function setPricingMapping(context: PostgresContext, change: BooleanChange) {
  return updateOne(context, "UPDATE real_connections SET pricing_mapping_enabled=$2,updated_at=$3 WHERE id=$1",
    [change.id, flag(change.enabled), change.at]);
}

function setLifecycle(context: PostgresContext, change: LifecycleChange) {
  return updateOne(context, `UPDATE real_connections SET status=$2,lifecycle_action=$3,lifecycle_stage=$4,
    disconnect_mode=$5,disconnect_remove_pricing=$6,last_error=$7,updated_at=$8 WHERE id=$1`,
  [change.id, change.status, change.action, change.stage, change.mode, flag(change.removePricing), change.error, change.at]);
}

function setStage(context: PostgresContext, change: StageChange) {
  return updateOne(context, `UPDATE real_connections SET lifecycle_stage=$2,last_error=$3,updated_at=$4 WHERE id=$1`,
    [change.id, change.stage, change.error, change.at]);
}

function setResourceDeleted(context: PostgresContext, change: ResourceDeletedChange) {
  const column = change.resource === "source" ? "source_credential_deleted" : "target_account_deleted";
  return updateOne(context, `UPDATE real_connections SET ${column}=1,updated_at=$2 WHERE id=$1`, [change.id, change.at]);
}

function finishProvision(context: PostgresContext, change: CompletionChange) {
  return updateOne(context, `UPDATE real_connections SET status='active',lifecycle_action=NULL,
    lifecycle_stage='idle',last_error=$2,updated_at=$3,disconnected_at=NULL WHERE id=$1`,
  [change.id, change.error, change.at]);
}

function finishDisconnect(context: PostgresContext, change: CompletionChange) {
  return updateOne(context, `UPDATE real_connections SET status='disconnected',lifecycle_action=NULL,
    lifecycle_stage='idle',last_error=$2,disconnected_at=$3,updated_at=$3 WHERE id=$1`,
  [change.id, change.error, change.at]);
}

async function updateOne(context: PostgresContext, sql: string, values: readonly unknown[]) {
  const result = await execute(context, sql, values);
  if (result.rowCount !== 1) throw new Error(`真实连接不存在: ${String(values[0])}`);
}

function connectionValues(value: RealConnection) {
  return [value.id, value.operationId, value.sourceSiteId, value.sourceSiteName, value.sourceGroupId,
    value.sourceGroupName, value.sourcePlatform, value.sourceCredentialId, value.targetAccountId,
    value.targetAccountName, JSON.stringify(value.targetGroupIds), JSON.stringify(value.targetGroupNames),
    value.groupType, value.resourceName, value.provisioningMode, value.status, flag(value.pricingMappingEnabled),
    flag(value.pricingMappingRequested), flag(value.sourceCredentialDeleted), flag(value.targetAccountDeleted),
    value.lifecycleAction, value.lifecycleStage, value.disconnectMode, flag(value.disconnectRemovePricing),
    value.lastError, value.createdAt, value.updatedAt, value.disconnectedAt];
}

function mapConnection(value: Record<string, unknown>): RealConnection {
  return { id: String(value.id), operationId: String(value.operation_id), sourceSiteId: Number(value.source_site_id),
    sourceSiteName: String(value.source_site_name), sourceGroupId: String(value.source_group_id),
    sourceGroupName: String(value.source_group_name), sourcePlatform: String(value.source_platform),
    sourceCredentialId: String(value.source_credential_id), targetAccountId: nullableNumber(value.target_account_id),
    targetAccountName: String(value.target_account_name), targetGroupIds: numberArray(value.target_group_ids_json),
    targetGroupNames: stringArray(value.target_group_names_json), groupType: String(value.group_type) as RealConnection["groupType"],
    resourceName: String(value.resource_name), provisioningMode: String(value.provisioning_mode) as RealConnection["provisioningMode"],
    status: String(value.status) as RealConnection["status"], pricingMappingEnabled: truthy(value.pricing_mapping_enabled),
    pricingMappingRequested: truthy(value.pricing_mapping_requested), sourceCredentialDeleted: truthy(value.source_credential_deleted),
    targetAccountDeleted: truthy(value.target_account_deleted), lifecycleAction: nullableText(value.lifecycle_action) as RealConnection["lifecycleAction"],
    lifecycleStage: String(value.lifecycle_stage) as RealConnection["lifecycleStage"],
    disconnectMode: String(value.disconnect_mode) as RealConnection["disconnectMode"],
    disconnectRemovePricing: truthy(value.disconnect_remove_pricing), lastError: nullableText(value.last_error),
    createdAt: String(value.created_at), updatedAt: String(value.updated_at), disconnectedAt: nullableText(value.disconnected_at) };
}

function placeholders(count: number) { return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(","); }
function numberArray(value: unknown) { return validateArray(value, (item) => Number.isInteger(item) && Number(item) > 0).map(Number); }
function stringArray(value: unknown) { return validateArray(value, (item) => typeof item === "string") as string[]; }
function validateArray(value: unknown, valid: (item: unknown) => boolean) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => !valid(item))) throw new Error("真实连接数组字段无效");
  return parsed;
}
function flag(value: boolean) { return value ? 1 : 0; }
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
