import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, sqlitePath } from "../../storage/sqlite-utils.ts";
import type {
  NewConnectionLifecycleEvent, RealConnection,
} from "./types.ts";
import {
  insertLifecycleEvent, readLifecycleEventPage, type LifecycleEventQuery,
} from "./event-store.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type ConnectionStore = Readonly<{
  get: (id: string) => Awaitable<RealConnection | null>;
  findByOperationId: (operationId: string) => Awaitable<RealConnection | null>;
  findOpen: (siteId: number, groupId: string) => Awaitable<RealConnection | null>;
  list: () => Awaitable<RealConnection[]>;
  listRecoverable: () => Awaitable<RealConnection[]>;
  insert: (connection: RealConnection) => Awaitable<void>;
  restartProvisioning: (connection: RealConnection) => Awaitable<void>;
  setResourceName: (change: ResourceNameChange) => Awaitable<void>;
  setSourceCredential: (change: SourceCredentialChange) => Awaitable<void>;
  setTargetAccount: (change: TargetAccountChange) => Awaitable<void>;
  setPricingMapping: (change: BooleanChange) => Awaitable<void>;
  setLifecycle: (change: LifecycleChange) => Awaitable<void>;
  setStage: (change: StageChange) => Awaitable<void>;
  setResourceDeleted: (change: ResourceDeletedChange) => Awaitable<void>;
  finishProvision: (change: CompletionChange) => Awaitable<void>;
  finishDisconnect: (change: CompletionChange) => Awaitable<void>;
  appendEvent: (event: NewConnectionLifecycleEvent) => Awaitable<void>;
  eventPage: (query: LifecycleEventQuery) => Awaitable<ReturnType<typeof readLifecycleEventPage>>;
  close: () => Awaitable<void>;
}>;

export function createSqliteConnectionStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return connectionStore(database);
}

function connectionStore(database: DatabaseSync) {
  return {
    get: (id) => readOne(database, "id", id),
    findByOperationId: (id) => readOne(database, "operation_id", id),
    findOpen: (siteId, groupId) => findOpen(database, siteId, groupId),
    list: () => listConnections(database),
    listRecoverable: () => listRecoverable(database),
    insert: (connection) => insertConnection(database, connection),
    restartProvisioning: (connection) => restartProvisioning(database, connection),
    setResourceName: (change) => setResourceName(database, change),
    setSourceCredential: (change) => setSourceCredential(database, change),
    setTargetAccount: (change) => setTargetAccount(database, change),
    setPricingMapping: (change) => setPricingMapping(database, change),
    setLifecycle: (change) => setLifecycle(database, change),
    setStage: (change) => setStage(database, change),
    setResourceDeleted: (change) => setResourceDeleted(database, change),
    finishProvision: (change) => finishProvision(database, change),
    finishDisconnect: (change) => finishDisconnect(database, change),
    appendEvent: (event) => insertLifecycleEvent(database, event),
    eventPage: (query) => readLifecycleEventPage(database, query),
    close: () => database.close(),
  } satisfies ConnectionStore;
}

function readOne(database: DatabaseSync, column: "id" | "operation_id", value: string) {
  const row = database.prepare(`SELECT * FROM real_connections WHERE ${column}=?`).get(value) as Row | undefined;
  return row ? mapConnection(row) : null;
}

function findOpen(database: DatabaseSync, siteId: number, groupId: string) {
  const row = database.prepare(`SELECT * FROM real_connections
    WHERE source_site_id=? AND source_group_id=?
      AND status IN ('provisioning', 'active', 'disconnecting', 'error')`).get(siteId, groupId) as Row | undefined;
  return row ? mapConnection(row) : null;
}

function listConnections(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM real_connections ORDER BY created_at DESC, id DESC").all() as Row[])
    .map(mapConnection);
}

function listRecoverable(database: DatabaseSync) {
  return (database.prepare(`SELECT * FROM real_connections WHERE lifecycle_action IS NOT NULL
    AND status IN ('provisioning', 'disconnecting', 'error') ORDER BY updated_at, id`).all() as Row[])
    .map(mapConnection);
}

function insertConnection(database: DatabaseSync, value: RealConnection) {
  database.prepare(`INSERT INTO real_connections (
    id, operation_id, source_site_id, source_site_name, source_group_id, source_group_name,
    source_platform, source_credential_id, target_account_id, target_account_name,
    target_group_ids_json, target_group_names_json, group_type, resource_name,
    provisioning_mode, status, pricing_mapping_enabled, pricing_mapping_requested,
    source_credential_deleted, target_account_deleted, lifecycle_action, lifecycle_stage,
    disconnect_mode, disconnect_remove_pricing, last_error, created_at, updated_at, disconnected_at
  ) VALUES (
    :id, :operationId, :sourceSiteId, :sourceSiteName, :sourceGroupId, :sourceGroupName,
    :sourcePlatform, :sourceCredentialId, :targetAccountId, :targetAccountName,
    :targetGroupIds, :targetGroupNames, :groupType, :resourceName,
    :provisioningMode, :status, :pricingMappingEnabled, :pricingMappingRequested,
    :sourceCredentialDeleted, :targetAccountDeleted, :lifecycleAction, :lifecycleStage,
    :disconnectMode, :disconnectRemovePricing, :lastError, :createdAt, :updatedAt, :disconnectedAt
  )`).run(connectionBindings(value));
}

function restartProvisioning(database: DatabaseSync, value: RealConnection) {
  requiredChange(database.prepare(`UPDATE real_connections SET
    source_site_name=:sourceSiteName, source_group_name=:sourceGroupName, source_platform=:sourcePlatform,
    source_credential_id=:sourceCredentialId, target_account_id=:targetAccountId,
    target_account_name=:targetAccountName, target_group_ids_json=:targetGroupIds,
    target_group_names_json=:targetGroupNames, group_type=:groupType, resource_name=:resourceName,
    provisioning_mode=:provisioningMode, status='provisioning', pricing_mapping_enabled=0,
    pricing_mapping_requested=:pricingMappingRequested, source_credential_deleted=0,
    target_account_deleted=0, lifecycle_action='provision', lifecycle_stage='metadata',
    last_error=NULL, updated_at=:updatedAt, disconnected_at=NULL WHERE id=:id`)
    .run(connectionBindings(value)), value.id);
}

function setResourceName(database: DatabaseSync, change: ResourceNameChange) {
  updateOne(database, { sql: "UPDATE real_connections SET resource_name=?, updated_at=? WHERE id=?",
    values: [change.resourceName, change.at, change.id], id: change.id });
}

function setSourceCredential(database: DatabaseSync, change: SourceCredentialChange) {
  updateOne(database, { sql: "UPDATE real_connections SET source_credential_id=?, updated_at=? WHERE id=?",
    values: [change.credentialId, change.at, change.id], id: change.id });
}

function setTargetAccount(database: DatabaseSync, change: TargetAccountChange) {
  updateOne(database, { sql: "UPDATE real_connections SET target_account_id=?, target_account_name=?, updated_at=? WHERE id=?",
    values: [change.accountId, change.accountName, change.at, change.id], id: change.id });
}

function setPricingMapping(database: DatabaseSync, change: BooleanChange) {
  updateOne(database, { sql: "UPDATE real_connections SET pricing_mapping_enabled=?, updated_at=? WHERE id=?",
    values: [flag(change.enabled), change.at, change.id], id: change.id });
}

function setLifecycle(database: DatabaseSync, change: LifecycleChange) {
  updateOne(database, { sql: `UPDATE real_connections SET status=?, lifecycle_action=?, lifecycle_stage=?,
    disconnect_mode=?, disconnect_remove_pricing=?, last_error=?, updated_at=? WHERE id=?`, values: [
    change.status, change.action, change.stage, change.mode, flag(change.removePricing),
    change.error, change.at, change.id,
  ], id: change.id });
}

function setStage(database: DatabaseSync, change: StageChange) {
  updateOne(database, { sql: "UPDATE real_connections SET lifecycle_stage=?, last_error=?, updated_at=? WHERE id=?",
    values: [change.stage, change.error, change.at, change.id], id: change.id });
}

function setResourceDeleted(database: DatabaseSync, change: ResourceDeletedChange) {
  const column = change.resource === "source" ? "source_credential_deleted" : "target_account_deleted";
  updateOne(database, { sql: `UPDATE real_connections SET ${column}=1, updated_at=? WHERE id=?`,
    values: [change.at, change.id], id: change.id });
}

function finishProvision(database: DatabaseSync, change: CompletionChange) {
  updateOne(database, { sql: `UPDATE real_connections SET status='active', lifecycle_action=NULL,
    lifecycle_stage='idle', last_error=?, updated_at=?, disconnected_at=NULL WHERE id=?`,
    values: [change.error, change.at, change.id], id: change.id });
}

function finishDisconnect(database: DatabaseSync, change: CompletionChange) {
  updateOne(database, { sql: `UPDATE real_connections SET status='disconnected', lifecycle_action=NULL,
    lifecycle_stage='idle', last_error=?, disconnected_at=?, updated_at=? WHERE id=?`,
    values: [change.error, change.at, change.at, change.id], id: change.id });
}

function updateOne(
  database: DatabaseSync,
  input: Readonly<{ sql: string; values: readonly SqlValue[]; id: string }>,
) {
  requiredChange(database.prepare(input.sql).run(...input.values), input.id);
}

function requiredChange(result: { readonly changes: number | bigint }, id: string) {
  if (Number(result.changes) !== 1) throw new Error(`真实连接不存在: ${id}`);
}

function connectionBindings(value: RealConnection) {
  return {
    ...value,
    targetGroupIds: JSON.stringify(value.targetGroupIds),
    targetGroupNames: JSON.stringify(value.targetGroupNames),
    pricingMappingEnabled: flag(value.pricingMappingEnabled),
    pricingMappingRequested: flag(value.pricingMappingRequested),
    sourceCredentialDeleted: flag(value.sourceCredentialDeleted),
    targetAccountDeleted: flag(value.targetAccountDeleted),
    disconnectRemovePricing: flag(value.disconnectRemovePricing),
  };
}

function mapConnection(row: Row): RealConnection {
  return {
    id: String(row.id), operationId: String(row.operation_id), sourceSiteId: Number(row.source_site_id),
    sourceSiteName: String(row.source_site_name), sourceGroupId: String(row.source_group_id),
    sourceGroupName: String(row.source_group_name), sourcePlatform: String(row.source_platform),
    sourceCredentialId: String(row.source_credential_id), targetAccountId: nullableNumber(row.target_account_id),
    targetAccountName: String(row.target_account_name), targetGroupIds: numberArray(row.target_group_ids_json),
    targetGroupNames: stringArray(row.target_group_names_json), groupType: String(row.group_type) as RealConnection["groupType"],
    resourceName: String(row.resource_name), provisioningMode: String(row.provisioning_mode) as RealConnection["provisioningMode"],
    status: String(row.status) as RealConnection["status"], pricingMappingEnabled: flagValue(row.pricing_mapping_enabled),
    pricingMappingRequested: flagValue(row.pricing_mapping_requested), sourceCredentialDeleted: flagValue(row.source_credential_deleted),
    targetAccountDeleted: flagValue(row.target_account_deleted), lifecycleAction: nullableText(row.lifecycle_action) as RealConnection["lifecycleAction"],
    lifecycleStage: String(row.lifecycle_stage) as RealConnection["lifecycleStage"], disconnectMode: String(row.disconnect_mode) as RealConnection["disconnectMode"],
    disconnectRemovePricing: flagValue(row.disconnect_remove_pricing),
    lastError: nullableText(row.last_error), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    disconnectedAt: nullableText(row.disconnected_at),
  };
}

function numberArray(value: unknown) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => !Number.isInteger(item) || Number(item) <= 0)) {
    throw new Error("真实连接目标分组 ID 无效");
  }
  return parsed.map(Number);
}

function stringArray(value: unknown) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("真实连接目标分组名称无效");
  }
  return parsed as string[];
}

function flagValue(value: unknown) { return Number(value) === 1; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }

export type ResourceNameChange = Readonly<{ id: string; resourceName: string; at: string }>;
export type SourceCredentialChange = Readonly<{ id: string; credentialId: string; at: string }>;
export type TargetAccountChange = Readonly<{ id: string; accountId: number; accountName: string; at: string }>;
export type BooleanChange = Readonly<{ id: string; enabled: boolean; at: string }>;
export type LifecycleChange = Readonly<{
  id: string; status: RealConnection["status"]; action: RealConnection["lifecycleAction"];
  stage: RealConnection["lifecycleStage"]; mode: RealConnection["disconnectMode"];
  removePricing: boolean; error: string | null; at: string;
}>;
export type StageChange = Readonly<{ id: string; stage: RealConnection["lifecycleStage"]; error: string | null; at: string }>;
export type ResourceDeletedChange = Readonly<{ id: string; resource: "source" | "target"; at: string }>;
export type CompletionChange = Readonly<{ id: string; error: string | null; at: string }>;
type SqlValue = string | number | bigint | Uint8Array | null;
type Row = Record<string, unknown>;
