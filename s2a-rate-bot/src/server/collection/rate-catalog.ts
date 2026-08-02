import type { DatabaseSync } from "node:sqlite";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { nowIso } from "../../storage/sqlite-utils.ts";

export function readRates(database: DatabaseSync, siteId?: number): SourceRateSnapshot[] {
  const sql = currentRatesSql(siteId !== undefined);
  const rows = (siteId === undefined ? database.prepare(sql).all() : database.prepare(sql).all(siteId)) as Record<string, unknown>[];
  return rows.map((row) => mapRate(row, false));
}

export function readRateCatalog(database: DatabaseSync, siteId?: number) {
  const current = readRates(database, siteId);
  const deleted = readDeletedRates(database, siteId);
  return [...current, ...deleted].sort(compareRateIdentity);
}

export function setRatePlatform(
  database: DatabaseSync,
  input: Readonly<{ siteId: number; groupId: string; platform: string | null }>,
) {
  const exists = database.prepare("SELECT 1 FROM collection_group_rates WHERE site_id = ? AND group_id = ?").get(input.siteId, input.groupId);
  if (!exists) throw new Error(`采集分组不存在: ${input.siteId}:${input.groupId}`);
  if (input.platform) upsertPlatform(database, { siteId: input.siteId, groupId: input.groupId, platform: input.platform });
  else database.prepare("DELETE FROM collection_group_platform_overrides WHERE site_id = ? AND group_id = ?").run(input.siteId, input.groupId);
  return readRates(database, input.siteId).find((rate) => rate.groupId === input.groupId)!;
}

export function setRateGroupType(
  database: DatabaseSync,
  input: Readonly<{ siteId: number; groupId: string; groupType: string | null }>,
) {
  assertCurrentRate(database, input.siteId, input.groupId);
  if (input.groupType) upsertGroupType(database, { ...input, groupType: input.groupType });
  else database.prepare("DELETE FROM collection_group_metadata WHERE site_id = ? AND group_id = ?").run(input.siteId, input.groupId);
  return readRates(database, input.siteId).find((rate) => rate.groupId === input.groupId)!;
}

function currentRatesSql(filtered: boolean) {
  return `SELECT rates.*,
    CASE WHEN EXISTS (SELECT 1 FROM target_group_bindings AS bindings
      WHERE bindings.source_site_id = rates.site_id AND bindings.source_group_id = rates.group_id)
      THEN 'mapped' ELSE 'unmapped' END AS mapping_status,
    CASE WHEN connections.status='active' THEN 1 ELSE 0 END AS connected,
    connections.id AS connection_id,
    connections.status AS connection_status,
    connections.lifecycle_stage AS connection_stage,
    connections.last_error AS connection_error,
    EXISTS (SELECT 1 FROM target_group_bindings AS mappings
      WHERE mappings.source_site_id = rates.site_id AND mappings.source_group_id = rates.group_id) AS pricing_mapped,
    overrides.platform AS platform_override,
    metadata.group_type,
    (SELECT changes.old_rate FROM collection_rate_changes AS changes
      WHERE changes.site_id = rates.site_id AND changes.group_id = rates.group_id
        AND changes.change_type = 'updated' ORDER BY changes.id DESC LIMIT 1) AS previous_rate
    FROM collection_group_rates AS rates
    LEFT JOIN collection_group_platform_overrides AS overrides
      ON overrides.site_id = rates.site_id AND overrides.group_id = rates.group_id
    LEFT JOIN collection_group_metadata AS metadata
      ON metadata.site_id = rates.site_id AND metadata.group_id = rates.group_id
    LEFT JOIN real_connections AS connections
      ON connections.source_site_id = rates.site_id AND connections.source_group_id = rates.group_id
      AND connections.status IN ('provisioning', 'active', 'disconnecting', 'error')
    ${filtered ? "WHERE rates.site_id = ?" : ""} ORDER BY rates.site_id, rates.group_id`;
}

function readDeletedRates(database: DatabaseSync, siteId?: number) {
  const sql = deletedRatesSql(siteId !== undefined);
  const rows = (siteId === undefined ? database.prepare(sql).all() : database.prepare(sql).all(siteId)) as Record<string, unknown>[];
  return rows.map((row) => mapRate(row, true));
}

function deletedRatesSql(filtered: boolean) {
  return `SELECT changes.site_id, changes.group_id, changes.group_name, changes.platform,
    changes.old_rate AS effective_rate, changes.collected_at, NULL AS raw_rate, NULL AS platform_override,
    NULL AS previous_rate, 'unmapped' AS mapping_status, 0 AS connected, 0 AS pricing_mapped,
    NULL AS connection_id, NULL AS connection_status, NULL AS connection_stage, NULL AS connection_error,
    metadata.group_type
    FROM collection_rate_changes AS changes
    LEFT JOIN collection_group_metadata AS metadata
      ON metadata.site_id = changes.site_id AND metadata.group_id = changes.group_id
    WHERE changes.change_type = 'deleted' AND changes.old_rate IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collection_group_rates AS current
        WHERE current.site_id = changes.site_id AND current.group_id = changes.group_id)
      AND changes.id = (SELECT MAX(latest.id) FROM collection_rate_changes AS latest
        WHERE latest.site_id = changes.site_id AND latest.group_id = changes.group_id AND latest.change_type = 'deleted')
      ${filtered ? "AND changes.site_id = ?" : ""}`;
}

function mapRate(row: Record<string, unknown>, deleted: boolean): SourceRateSnapshot {
  const effectiveRate = Number(row.effective_rate);
  const previousRate = nullableNumber(row.previous_rate);
  const delta = deleted || previousRate === null ? null : effectiveRate - previousRate;
  return {
    sourceSiteId: Number(row.site_id), groupId: String(row.group_id), groupName: String(row.group_name),
    platform: row.platform_override ? String(row.platform_override) : nullableText(row.platform) ?? undefined,
    platformOverride: nullableText(row.platform_override), groupType: nullableText(row.group_type),
    rawRate: nullableNumber(row.raw_rate), effectiveRate,
    collectedAt: new Date(String(row.collected_at)), mappingStatus: String(row.mapping_status) as "mapped" | "unmapped",
    connected: Number(row.connected) === 1, pricingMapped: Number(row.pricing_mapped) === 1,
    connectionId: nullableText(row.connection_id),
    connectionStatus: nullableText(row.connection_status) as SourceRateSnapshot["connectionStatus"],
    connectionStage: nullableText(row.connection_stage),
    connectionError: nullableText(row.connection_error),
    deleted, delta, deltaPercent: delta === null || previousRate === null || previousRate === 0 ? null : delta / previousRate * 100,
  };
}

function upsertPlatform(database: DatabaseSync, input: Readonly<{ siteId: number; groupId: string; platform: string }>) {
  database.prepare(`INSERT INTO collection_group_platform_overrides (site_id, group_id, platform, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(site_id, group_id) DO UPDATE SET platform=excluded.platform, updated_at=excluded.updated_at`)
    .run(input.siteId, input.groupId, input.platform, nowIso());
}

function upsertGroupType(database: DatabaseSync, input: Readonly<{ siteId: number; groupId: string; groupType: string }>) {
  database.prepare(`INSERT INTO collection_group_metadata (site_id, group_id, group_type, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(site_id, group_id) DO UPDATE SET group_type=excluded.group_type, updated_at=excluded.updated_at`)
    .run(input.siteId, input.groupId, input.groupType, nowIso());
}

function assertCurrentRate(database: DatabaseSync, siteId: number, groupId: string) {
  const exists = database.prepare("SELECT 1 FROM collection_group_rates WHERE site_id = ? AND group_id = ?").get(siteId, groupId);
  if (!exists) throw new Error(`采集分组不存在: ${siteId}:${groupId}`);
}

function compareRateIdentity(left: SourceRateSnapshot, right: SourceRateSnapshot) {
  return left.sourceSiteId - right.sourceSiteId || left.groupId.localeCompare(right.groupId);
}

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
