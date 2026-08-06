import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { execute, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";

export async function readPostgresRates(context: PostgresContext, siteId?: number) {
  const values = await rows<Record<string, unknown>>(context, currentRatesSql(siteId !== undefined), siteId === undefined ? [] : [siteId]);
  return values.map((value) => mapRate(value, false));
}

export async function readPostgresRateCatalog(context: PostgresContext, siteId?: number) {
  const [current, deleted] = await Promise.all([readPostgresRates(context, siteId), readDeletedRates(context, siteId)]);
  return [...current, ...deleted].sort(compareRateIdentity);
}

export async function setPostgresRatePlatform(
  context: PostgresContext,
  input: Readonly<{ siteId: number; groupId: string; platform: string | null }>,
) {
  await assertCurrentRate(context, input.siteId, input.groupId);
  if (input.platform) {
    await execute(context, `INSERT INTO collection_group_platform_overrides (site_id,group_id,platform,updated_at)
      VALUES ($1,$2,$3,$4) ON CONFLICT(site_id,group_id) DO UPDATE SET
      platform=EXCLUDED.platform,updated_at=EXCLUDED.updated_at`,
    [input.siteId, input.groupId, input.platform, new Date().toISOString()]);
  } else {
    await execute(context, "DELETE FROM collection_group_platform_overrides WHERE site_id=$1 AND group_id=$2",
      [input.siteId, input.groupId]);
  }
  return requiredRate(context, input.siteId, input.groupId);
}

export async function setPostgresRateGroupType(
  context: PostgresContext,
  input: Readonly<{ siteId: number; groupId: string; groupType: string | null }>,
) {
  await assertCurrentRate(context, input.siteId, input.groupId);
  if (input.groupType) {
    await execute(context, `INSERT INTO collection_group_metadata (site_id,group_id,group_type,updated_at)
      VALUES ($1,$2,$3,$4) ON CONFLICT(site_id,group_id) DO UPDATE SET
      group_type=EXCLUDED.group_type,updated_at=EXCLUDED.updated_at`,
    [input.siteId, input.groupId, input.groupType, new Date().toISOString()]);
  } else {
    await execute(context, "DELETE FROM collection_group_metadata WHERE site_id=$1 AND group_id=$2",
      [input.siteId, input.groupId]);
  }
  return requiredRate(context, input.siteId, input.groupId);
}

function currentRatesSql(filtered: boolean) {
  return `SELECT rates.*,
    CASE WHEN EXISTS (SELECT 1 FROM target_group_bindings b WHERE b.source_site_id=rates.site_id
      AND b.source_group_id=rates.group_id) THEN 'mapped' ELSE 'unmapped' END AS mapping_status,
    CASE WHEN connections.status='active' THEN 1 ELSE 0 END AS connected,
    connections.id AS connection_id,connections.status AS connection_status,
    connections.lifecycle_stage AS connection_stage,connections.last_error AS connection_error,
    EXISTS (SELECT 1 FROM target_group_bindings m WHERE m.source_site_id=rates.site_id
      AND m.source_group_id=rates.group_id) AS pricing_mapped,
    overrides.platform AS platform_override,metadata.group_type,
    (SELECT changes.old_rate FROM collection_rate_changes changes WHERE changes.site_id=rates.site_id
      AND changes.group_id=rates.group_id AND changes.change_type='updated'
      ORDER BY changes.id DESC LIMIT 1) AS previous_rate
    FROM collection_group_rates rates
    LEFT JOIN collection_group_platform_overrides overrides
      ON overrides.site_id=rates.site_id AND overrides.group_id=rates.group_id
    LEFT JOIN collection_group_metadata metadata
      ON metadata.site_id=rates.site_id AND metadata.group_id=rates.group_id
    LEFT JOIN real_connections connections ON connections.source_site_id=rates.site_id
      AND connections.source_group_id=rates.group_id
      AND connections.status IN ('provisioning','active','disconnecting','error')
    ${filtered ? "WHERE rates.site_id=$1" : ""} ORDER BY rates.site_id,rates.group_id`;
}

async function readDeletedRates(context: PostgresContext, siteId?: number) {
  const values = await rows<Record<string, unknown>>(context, deletedRatesSql(siteId !== undefined), siteId === undefined ? [] : [siteId]);
  return values.map((value) => mapRate(value, true));
}

function deletedRatesSql(filtered: boolean) {
  return `SELECT changes.site_id,changes.group_id,changes.group_name,changes.platform,
    changes.old_rate AS effective_rate,changes.collected_at,NULL AS raw_rate,NULL AS platform_override,
    NULL AS previous_rate,'unmapped' AS mapping_status,0 AS connected,false AS pricing_mapped,
    NULL AS connection_id,NULL AS connection_status,NULL AS connection_stage,NULL AS connection_error,
    metadata.group_type FROM collection_rate_changes changes
    LEFT JOIN collection_group_metadata metadata ON metadata.site_id=changes.site_id AND metadata.group_id=changes.group_id
    WHERE changes.change_type='deleted' AND changes.old_rate IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collection_group_rates current WHERE current.site_id=changes.site_id
        AND current.group_id=changes.group_id)
      AND changes.id=(SELECT MAX(latest.id) FROM collection_rate_changes latest
        WHERE latest.site_id=changes.site_id AND latest.group_id=changes.group_id AND latest.change_type='deleted')
      ${filtered ? "AND changes.site_id=$1" : ""}`;
}

function mapRate(value: Record<string, unknown>, deleted: boolean): SourceRateSnapshot {
  const effectiveRate = Number(value.effective_rate);
  const previousRate = nullableNumber(value.previous_rate);
  const delta = deleted || previousRate === null ? null : effectiveRate - previousRate;
  return { sourceSiteId: Number(value.site_id), groupId: String(value.group_id), groupName: String(value.group_name),
    platform: value.platform_override ? String(value.platform_override) : nullableText(value.platform) ?? undefined,
    platformOverride: nullableText(value.platform_override), groupType: nullableText(value.group_type),
    rawRate: nullableNumber(value.raw_rate), effectiveRate, collectedAt: new Date(String(value.collected_at)),
    mappingStatus: String(value.mapping_status) as "mapped" | "unmapped", connected: truthy(value.connected),
    pricingMapped: truthy(value.pricing_mapped), connectionId: nullableText(value.connection_id),
    connectionStatus: nullableText(value.connection_status) as SourceRateSnapshot["connectionStatus"],
    connectionStage: nullableText(value.connection_stage), connectionError: nullableText(value.connection_error),
    deleted, delta, deltaPercent: delta === null || previousRate === null || previousRate === 0 ? null : delta / previousRate * 100 };
}

async function requiredRate(context: PostgresContext, siteId: number, groupId: string) {
  const found = (await readPostgresRates(context, siteId)).find((value) => value.groupId === groupId);
  if (!found) throw new Error(`采集分组不存在: ${siteId}:${groupId}`);
  return found;
}

async function assertCurrentRate(context: PostgresContext, siteId: number, groupId: string) {
  const found = await row(context, "SELECT 1 FROM collection_group_rates WHERE site_id=$1 AND group_id=$2", [siteId, groupId]);
  if (!found) throw new Error(`采集分组不存在: ${siteId}:${groupId}`);
}

function compareRateIdentity(left: SourceRateSnapshot, right: SourceRateSnapshot) {
  return left.sourceSiteId - right.sourceSiteId || left.groupId.localeCompare(right.groupId);
}
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
