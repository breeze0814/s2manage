import { DatabaseSync } from "node:sqlite";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import { compareRateSnapshots, type PendingRateChange } from "./rate-changes.ts";
import type { CollectionOverview, CollectionRateChange, CollectionSiteStored } from "./types.ts";

const DEFAULT_CHANGE_LIMIT = 50;
const MISSING_BINDINGS_RULE_ERROR = "绑定的采集分组已删除，倍率规则已自动停用";

export type CollectionChangesQuery = {
  readonly limit?: number;
  readonly since?: string;
};

export type CollectionStore = {
  readonly create: (site: Omit<CollectionSiteStored, "id" | StatusFields>) => CollectionSiteStored;
  readonly update: (id: number, site: Omit<CollectionSiteStored, "id" | StatusFields>) => CollectionSiteStored;
  readonly get: (id: number) => CollectionSiteStored | null;
  readonly list: () => CollectionSiteStored[];
  readonly delete: (id: number) => void;
  readonly recordSuccess: (siteId: number, overview: CollectionOverview, startedAt: string, credentials?: EncryptedCredentials) => void;
  readonly recordFailure: (siteId: number, error: string, startedAt: string) => void;
  readonly rates: (siteId?: number) => SourceRateSnapshot[];
  readonly setRatePlatform: (siteId: number, groupId: string, platform: string | null) => SourceRateSnapshot;
  readonly changes: (query?: CollectionChangesQuery) => CollectionRateChange[];
  readonly close: () => void;
};

type StatusFields = "accountLabel" | "balance" | "lastRunAt" | "lastSuccessAt" | "lastStatus" | "lastError" | "consecutiveFailures";
type SiteWrite = Omit<CollectionSiteStored, "id" | StatusFields>;
export type EncryptedCredentials = { readonly accessTokenEnc?: string; readonly refreshTokenEnc?: string };

export function createSqliteCollectionStore(databaseUrl: string): CollectionStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return collectionStore(database);
}

function collectionStore(database: DatabaseSync): CollectionStore {
  return {
    create: (site) => createSite(database, site),
    update: (id, site) => updateSite(database, id, site),
    get: (id) => readSite(database, id),
    list: () => listSites(database),
    delete: (id) => deleteSite(database, id),
    recordSuccess: (siteId, overview, startedAt, credentials) => recordSuccess(database, siteId, overview, startedAt, credentials),
    recordFailure: (siteId, error, startedAt) => recordFailure(database, siteId, error, startedAt),
    rates: (siteId) => readRates(database, siteId),
    setRatePlatform: (siteId, groupId, platform) => setRatePlatform(database, siteId, groupId, platform),
    changes: (query) => readChanges(database, query),
    close: () => database.close(),
  };
}

function createSite(database: DatabaseSync, site: SiteWrite) {
  const timestamp = nowIso();
  const result = database.prepare(`${siteInsertSql()} VALUES (
    :name, :siteType, :baseUrl, :authMode, :username, :newApiUserId, :passwordEnc, :accessTokenEnc,
    :refreshTokenEnc, :rechargeRatio, :intervalSeconds, :useProxy, :enabled, :createdAt, :updatedAt
  )`).run({ ...siteBindings(site, timestamp), createdAt: timestamp });
  return requiredSite(database, Number(result.lastInsertRowid));
}

function updateSite(database: DatabaseSync, id: number, site: SiteWrite) {
  const result = database.prepare(`UPDATE collection_sites SET name=:name, site_type=:siteType,
    base_url=:baseUrl, auth_mode=:authMode, username=:username, new_api_user_id=:newApiUserId,
    password_enc=:passwordEnc,
    access_token_enc=:accessTokenEnc, refresh_token_enc=:refreshTokenEnc,
    recharge_ratio=:rechargeRatio, interval_seconds=:intervalSeconds, use_proxy=:useProxy,
    enabled=:enabled, updated_at=:updatedAt WHERE id=:id`).run({ ...siteBindings(site, nowIso()), id });
  if (result.changes !== 1) throw new Error(`采集站不存在: ${id}`);
  return requiredSite(database, id);
}

function siteInsertSql() {
  return `INSERT INTO collection_sites (
    name, site_type, base_url, auth_mode, username, new_api_user_id, password_enc, access_token_enc,
    refresh_token_enc, recharge_ratio, interval_seconds, use_proxy, enabled, created_at, updated_at
  )`;
}

function siteBindings(site: SiteWrite, timestamp: string) {
  return { ...site, useProxy: flag(site.useProxy), enabled: flag(site.enabled), updatedAt: timestamp };
}

function readSite(database: DatabaseSync, id: number) {
  const row = database.prepare("SELECT * FROM collection_sites WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapSite(row) : null;
}

function requiredSite(database: DatabaseSync, id: number) {
  const site = readSite(database, id);
  if (!site) throw new Error(`采集站不存在: ${id}`);
  return site;
}

function listSites(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM collection_sites ORDER BY id").all() as Record<string, unknown>[]).map(mapSite);
}

function deleteSite(database: DatabaseSync, id: number) {
  const result = database.prepare("DELETE FROM collection_sites WHERE id = ?").run(id);
  if (result.changes !== 1) throw new Error(`采集站不存在: ${id}`);
}

function recordSuccess(database: DatabaseSync, siteId: number, overview: CollectionOverview, startedAt: string, credentials?: EncryptedCredentials) {
  const finishedAt = nowIso();
  transaction(database, () => {
    const changes = compareRateSnapshots(readRates(database, siteId), overview.rates);
    database.prepare(`UPDATE collection_sites SET account_label=:label, balance=:balance,
      last_run_at=:finishedAt, last_success_at=:finishedAt, last_status='success', last_error=NULL,
      consecutive_failures=0, access_token_enc=COALESCE(:accessTokenEnc, access_token_enc),
      refresh_token_enc=COALESCE(:refreshTokenEnc, refresh_token_enc), updated_at=:finishedAt
      WHERE id=:siteId`).run({ siteId, label: overview.account.label, balance: overview.account.balance,
      accessTokenEnc: credentials?.accessTokenEnc ?? null, refreshTokenEnc: credentials?.refreshTokenEnc ?? null, finishedAt });
    const runId = insertRun(database, { siteId, status: "success", error: null, groupCount: overview.rates.length, startedAt, finishedAt });
    insertChanges(database, { runId, siteId, changes, collectedAt: finishedAt });
    replaceRates(database, siteId, overview.rates);
    removeMissingBindings(database, siteId);
  });
}

function recordFailure(database: DatabaseSync, siteId: number, error: string, startedAt: string) {
  const finishedAt = nowIso();
  transaction(database, () => {
    database.prepare(`UPDATE collection_sites SET last_run_at=:finishedAt, last_status='failed',
      last_error=:error, consecutive_failures=consecutive_failures+1, updated_at=:finishedAt
      WHERE id=:siteId`).run({ siteId, error, finishedAt });
    insertRun(database, { siteId, status: "failed", error, groupCount: 0, startedAt, finishedAt });
  });
}

function replaceRates(database: DatabaseSync, siteId: number, rates: readonly SourceRateSnapshot[]) {
  database.prepare("DELETE FROM collection_group_rates WHERE site_id = ?").run(siteId);
  const statement = database.prepare(`INSERT INTO collection_group_rates VALUES (
    :siteId, :groupId, :groupName, :platform, :rawRate, :effectiveRate, :collectedAt)`);
  for (const rate of rates) statement.run({ siteId, groupId: rate.groupId, groupName: rate.groupName, platform: rate.platform ?? null, rawRate: rate.rawRate, effectiveRate: rate.effectiveRate, collectedAt: rate.collectedAt.toISOString() });
}

function removeMissingBindings(database: DatabaseSync, siteId: number) {
  database.prepare(`DELETE FROM target_group_bindings AS bindings
    WHERE bindings.source_site_id = :siteId AND NOT EXISTS (
      SELECT 1 FROM collection_group_rates AS rates
      WHERE rates.site_id = :siteId AND rates.group_id = bindings.source_group_id
    )`).run({ siteId });
  database.prepare(`UPDATE target_group_rules AS rules SET enabled=0, last_error=:error, updated_at=:updatedAt
    WHERE rules.enabled=1 AND NOT EXISTS (
      SELECT 1 FROM target_group_bindings AS bindings WHERE bindings.group_id = rules.group_id
    )`).run({ error: MISSING_BINDINGS_RULE_ERROR, updatedAt: nowIso() });
}

function insertRun(database: DatabaseSync, run: Record<string, string | number | null>) {
  const result = database.prepare(`INSERT INTO collection_runs (site_id, status, error, group_count, started_at, finished_at)
    VALUES (:siteId, :status, :error, :groupCount, :startedAt, :finishedAt)`).run(run);
  return Number(result.lastInsertRowid);
}

function insertChanges(database: DatabaseSync, input: {
  readonly runId: number;
  readonly siteId: number;
  readonly changes: readonly PendingRateChange[];
  readonly collectedAt: string;
}) {
  const statement = database.prepare(`INSERT INTO collection_rate_changes (
    run_id, site_id, group_id, group_name, platform, change_type, old_rate, new_rate, collected_at
  ) VALUES (:runId, :siteId, :groupId, :groupName, :platform, :changeType, :oldRate, :newRate, :collectedAt)`);
  for (const change of input.changes) {
    statement.run({ runId: input.runId, siteId: input.siteId, collectedAt: input.collectedAt, ...change });
  }
}

function readRates(database: DatabaseSync, siteId?: number): SourceRateSnapshot[] {
  const sql = `SELECT rates.*, overrides.platform AS platform_override
    FROM collection_group_rates AS rates
    LEFT JOIN collection_group_platform_overrides AS overrides
      ON overrides.site_id = rates.site_id AND overrides.group_id = rates.group_id
    ${siteId ? "WHERE rates.site_id = ?" : ""} ORDER BY rates.site_id, rates.group_id`;
  const rows = (siteId ? database.prepare(sql).all(siteId) : database.prepare(sql).all()) as Record<string, unknown>[];
  return rows.map((row) => ({ sourceSiteId: Number(row.site_id), groupId: String(row.group_id), groupName: String(row.group_name), platform: row.platform_override ? String(row.platform_override) : row.platform ? String(row.platform) : undefined, platformOverride: nullableText(row.platform_override), rawRate: row.raw_rate === null ? null : Number(row.raw_rate), effectiveRate: Number(row.effective_rate), collectedAt: new Date(String(row.collected_at)) }));
}

function setRatePlatform(database: DatabaseSync, siteId: number, groupId: string, platform: string | null) {
  const exists = database.prepare("SELECT 1 FROM collection_group_rates WHERE site_id = ? AND group_id = ?").get(siteId, groupId);
  if (!exists) throw new Error(`采集分组不存在: ${siteId}:${groupId}`);
  if (platform) {
    database.prepare(`INSERT INTO collection_group_platform_overrides (site_id, group_id, platform, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(site_id, group_id) DO UPDATE SET platform=excluded.platform, updated_at=excluded.updated_at`).run(siteId, groupId, platform, nowIso());
  } else {
    database.prepare("DELETE FROM collection_group_platform_overrides WHERE site_id = ? AND group_id = ?").run(siteId, groupId);
  }
  return readRates(database, siteId).find((rate) => rate.groupId === groupId)!;
}

function readChanges(database: DatabaseSync, query: CollectionChangesQuery = {}): CollectionRateChange[] {
  const limit = query.limit ?? DEFAULT_CHANGE_LIMIT;
  const rows = database.prepare(`SELECT changes.*, sites.name AS site_name
    FROM collection_rate_changes AS changes
    JOIN collection_sites AS sites ON sites.id = changes.site_id
    WHERE (:since IS NULL OR changes.collected_at >= :since)
    ORDER BY changes.collected_at DESC, changes.id DESC LIMIT :limit`).all({
      since: query.since ?? null,
      limit,
    }) as Record<string, unknown>[];
  return rows.map(mapChange);
}

function mapChange(row: Record<string, unknown>): CollectionRateChange {
  return {
    id: Number(row.id), runId: Number(row.run_id), sourceSiteId: Number(row.site_id),
    sourceSiteName: String(row.site_name), groupId: String(row.group_id), groupName: String(row.group_name),
    platform: nullableText(row.platform), changeType: String(row.change_type) as CollectionRateChange["changeType"],
    oldRate: nullableNumber(row.old_rate), newRate: nullableNumber(row.new_rate), collectedAt: String(row.collected_at),
  };
}

function mapSite(row: Record<string, unknown>): CollectionSiteStored {
  return {
    id: Number(row.id), name: String(row.name), siteType: String(row.site_type) as CollectionSiteStored["siteType"],
    baseUrl: String(row.base_url), authMode: String(row.auth_mode) as CollectionSiteStored["authMode"], username: String(row.username),
    newApiUserId: String(row.new_api_user_id ?? ""),
    passwordEnc: String(row.password_enc), accessTokenEnc: String(row.access_token_enc), refreshTokenEnc: String(row.refresh_token_enc),
    rechargeRatio: Number(row.recharge_ratio), intervalSeconds: Number(row.interval_seconds), useProxy: Number(row.use_proxy) === 1,
    enabled: Number(row.enabled) === 1, accountLabel: nullableText(row.account_label), balance: nullableNumber(row.balance),
    lastRunAt: nullableText(row.last_run_at), lastSuccessAt: nullableText(row.last_success_at),
    lastStatus: nullableText(row.last_status) as CollectionSiteStored["lastStatus"], lastError: nullableText(row.last_error),
    consecutiveFailures: Number(row.consecutive_failures),
  };
}

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
