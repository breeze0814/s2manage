import { DatabaseSync } from "node:sqlite";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import { compareRateSnapshots, type PendingRateChange } from "./rate-changes.ts";
import { readChanges, readRuns, type CollectionChangesQuery, type CollectionRunRecord, type CollectionRunsQuery } from "./history.ts";
import { readRateCatalog, readRates, setRateGroupType, setRatePlatform } from "./rate-catalog.ts";
import type { CollectionOverview, CollectionRateChange, CollectionSiteStored } from "./types.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";
const MISSING_BINDINGS_RULE_ERROR = "绑定的采集分组已删除，倍率规则已自动停用";

export type CollectionStore = {
  readonly create: (site: SiteWrite) => Awaitable<CollectionSiteStored>;
  readonly update: (id: number, site: SiteWrite) => Awaitable<CollectionSiteStored>;
  readonly get: (id: number) => Awaitable<CollectionSiteStored | null>;
  readonly list: () => Awaitable<CollectionSiteStored[]>;
  readonly delete: (id: number) => Awaitable<void>;
  readonly beginRefresh: (siteId: number) => Awaitable<number>;
  readonly recordSuccess: (input: RefreshSuccess) => Awaitable<void>;
  readonly recordFailure: (input: RefreshFailure) => Awaitable<void>;
  readonly rates: (siteId?: number) => Awaitable<SourceRateSnapshot[]>;
  readonly catalog: (siteId?: number) => Awaitable<SourceRateSnapshot[]>;
  readonly setRatePlatform: (siteId: number, groupId: string, platform: string | null) => Awaitable<SourceRateSnapshot>;
  readonly setRateGroupType: (siteId: number, groupId: string, groupType: string | null) => Awaitable<SourceRateSnapshot>;
  readonly changes: (query?: CollectionChangesQuery) => Awaitable<CollectionRateChange[]>;
  readonly runs: (query?: CollectionRunsQuery) => Awaitable<CollectionRunRecord[]>;
  readonly close: () => Awaitable<void>;
};

type StatusFields = "accountLabel" | "balance" | "todayConsume" | "historyRecharge" | "lastRunAt" | "lastSuccessAt" | "lastStatus" | "lastError" | "consecutiveFailures" | "refreshVersion";
export type SiteWrite = Omit<CollectionSiteStored, "id" | StatusFields>;
export type EncryptedCredentials = { readonly accessTokenEnc?: string; readonly refreshTokenEnc?: string };
export type RefreshSuccess = RefreshIdentity & { readonly overview: CollectionOverview; readonly credentials?: EncryptedCredentials };
export type RefreshFailure = RefreshIdentity & { readonly error: string };
type RefreshIdentity = { readonly siteId: number; readonly refreshVersion: number; readonly startedAt: string };

export function createSqliteCollectionStore(databaseUrl: string) {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return collectionStore(database);
}

function collectionStore(database: DatabaseSync) {
  return {
    create: (site) => createSite(database, site),
    update: (id, site) => updateSite(database, id, site),
    get: (id) => readSite(database, id),
    list: () => listSites(database),
    delete: (id) => deleteSite(database, id),
    beginRefresh: (siteId) => beginRefresh(database, siteId),
    recordSuccess: (input) => recordSuccess(database, input),
    recordFailure: (input) => recordFailure(database, input),
    rates: (siteId?: number) => readRates(database, siteId),
    catalog: (siteId?: number) => readRateCatalog(database, siteId),
    setRatePlatform: (siteId, groupId, platform) => setRatePlatform(database, { siteId, groupId, platform }),
    setRateGroupType: (siteId, groupId, groupType) => setRateGroupType(database, { siteId, groupId, groupType }),
    changes: (query?: CollectionChangesQuery) => readChanges(database, query),
    runs: (query?: CollectionRunsQuery) => readRuns(database, query),
    close: () => database.close(),
  } satisfies CollectionStore;
}

function createSite(database: DatabaseSync, site: SiteWrite) {
  const timestamp = nowIso();
  const result = database.prepare(`${siteInsertSql()} VALUES (
    :name, :remark, :siteType, :baseUrl, :websiteUrl, :authMode, :username, :newApiUserId, :passwordEnc, :accessTokenEnc,
    :refreshTokenEnc, :rechargeRatio, :balanceAlertThreshold, :intervalSeconds, :useProxy, :enabled, :createdAt, :updatedAt
  )`).run({ ...siteBindings(site, timestamp), createdAt: timestamp });
  return requiredSite(database, Number(result.lastInsertRowid));
}

function updateSite(database: DatabaseSync, id: number, site: SiteWrite) {
  const result = database.prepare(`UPDATE collection_sites SET name=:name, remark=:remark, site_type=:siteType,
    base_url=:baseUrl, website_url=:websiteUrl, auth_mode=:authMode, username=:username, new_api_user_id=:newApiUserId,
    password_enc=:passwordEnc,
    access_token_enc=:accessTokenEnc, refresh_token_enc=:refreshTokenEnc,
    recharge_ratio=:rechargeRatio, balance_alert_threshold=:balanceAlertThreshold, interval_seconds=:intervalSeconds, use_proxy=:useProxy,
    enabled=:enabled, refresh_version=refresh_version+1, updated_at=:updatedAt WHERE id=:id`).run({ ...siteBindings(site, nowIso()), id });
  if (result.changes !== 1) throw new Error(`采集站不存在: ${id}`);
  return requiredSite(database, id);
}

function siteInsertSql() {
  return `INSERT INTO collection_sites (
    name, remark, site_type, base_url, website_url, auth_mode, username, new_api_user_id, password_enc, access_token_enc,
    refresh_token_enc, recharge_ratio, balance_alert_threshold, interval_seconds, use_proxy, enabled, created_at, updated_at
  )`;
}

function siteBindings(site: SiteWrite, timestamp: string) {
  return {
    ...site,
    remark: site.remark ?? "",
    balanceAlertThreshold: site.balanceAlertThreshold ?? null,
    useProxy: flag(site.useProxy),
    enabled: flag(site.enabled),
    updatedAt: timestamp,
  };
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

function beginRefresh(database: DatabaseSync, siteId: number) {
  const row = database.prepare(`UPDATE collection_sites SET refresh_version=refresh_version+1
    WHERE id=? RETURNING refresh_version`).get(siteId) as { refresh_version: number } | undefined;
  if (!row) throw new Error(`采集站不存在: ${siteId}`);
  return Number(row.refresh_version);
}

function recordSuccess(database: DatabaseSync, input: RefreshSuccess) {
  const finishedAt = nowIso();
  const completion = refreshCompletion(input.overview);
  transaction(database, () => {
    assertCurrentRefresh(database, input.siteId, input.refreshVersion);
    updateCompletedSite(database, { input, completion, finishedAt });
    const runId = insertRun(database, { siteId: input.siteId, ...completion,
      startedAt: input.startedAt, finishedAt });
    if (input.overview.rates === null) return;
    const changes = compareRateSnapshots(readRates(database, input.siteId), input.overview.rates);
    insertChanges(database, { runId, siteId: input.siteId, changes, collectedAt: finishedAt });
    replaceRates(database, input.siteId, input.overview.rates);
    removeMissingBindings(database, input.siteId);
  });
}

function updateCompletedSite(database: DatabaseSync, options: Readonly<{
  input: RefreshSuccess;
  completion: RefreshCompletion;
  finishedAt: string;
}>) {
  const { input, completion, finishedAt } = options;
  database.prepare(`UPDATE collection_sites SET
      last_run_at=:finishedAt, last_success_at=:finishedAt, last_status=:status, last_error=:error,
      consecutive_failures=0, access_token_enc=COALESCE(:accessTokenEnc, access_token_enc),
      refresh_token_enc=COALESCE(:refreshTokenEnc, refresh_token_enc), updated_at=:finishedAt
      WHERE id=:siteId`).run({ siteId: input.siteId, status: completion.status, error: completion.error,
    accessTokenEnc: input.credentials?.accessTokenEnc ?? null,
    refreshTokenEnc: input.credentials?.refreshTokenEnc ?? null, finishedAt });
  const account = input.overview.account;
  if (account === null) return;
  database.prepare(`UPDATE collection_sites SET account_label=:label, balance=:balance,
    today_consume=:todayConsume, history_recharge=:historyRecharge WHERE id=:siteId`).run({
    siteId: input.siteId, label: account.label, balance: account.balance,
    todayConsume: account.todayConsume, historyRecharge: account.historyRecharge,
  });
}

function recordFailure(database: DatabaseSync, input: RefreshFailure) {
  const finishedAt = nowIso();
  transaction(database, () => {
    assertCurrentRefresh(database, input.siteId, input.refreshVersion);
    database.prepare(`UPDATE collection_sites SET last_run_at=:finishedAt, last_status='failed',
      last_error=:error, consecutive_failures=consecutive_failures+1, updated_at=:finishedAt
      WHERE id=:siteId`).run({ siteId: input.siteId, error: input.error, finishedAt });
    insertRun(database, { siteId: input.siteId, status: "failed", error: input.error, groupCount: 0, startedAt: input.startedAt, finishedAt });
  });
}

function assertCurrentRefresh(database: DatabaseSync, siteId: number, refreshVersion: number) {
  const row = database.prepare("SELECT refresh_version FROM collection_sites WHERE id = ?").get(siteId) as { refresh_version: number } | undefined;
  if (Number(row?.refresh_version) !== refreshVersion) throw new CollectionRefreshSupersededError(siteId);
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
  database.prepare(`DELETE FROM target_account_bindings AS bindings
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

function mapSite(row: Record<string, unknown>): CollectionSiteStored {
  return {
    id: Number(row.id), name: String(row.name), remark: String(row.remark ?? ""), siteType: String(row.site_type) as CollectionSiteStored["siteType"],
    baseUrl: String(row.base_url), websiteUrl: String(row.website_url ?? ""),
    authMode: String(row.auth_mode) as CollectionSiteStored["authMode"], username: String(row.username),
    newApiUserId: String(row.new_api_user_id ?? ""),
    passwordEnc: String(row.password_enc), accessTokenEnc: String(row.access_token_enc), refreshTokenEnc: String(row.refresh_token_enc),
    rechargeRatio: Number(row.recharge_ratio), balanceAlertThreshold: nullableNumber(row.balance_alert_threshold), intervalSeconds: Number(row.interval_seconds), useProxy: Number(row.use_proxy) === 1,
    enabled: Number(row.enabled) === 1, accountLabel: nullableText(row.account_label), balance: nullableNumber(row.balance),
    todayConsume: nullableNumber(row.today_consume), historyRecharge: nullableNumber(row.history_recharge),
    lastRunAt: nullableText(row.last_run_at), lastSuccessAt: nullableText(row.last_success_at),
    lastStatus: nullableText(row.last_status) as CollectionSiteStored["lastStatus"], lastError: nullableText(row.last_error),
    consecutiveFailures: Number(row.consecutive_failures), refreshVersion: Number(row.refresh_version),
  };
}

export class CollectionRefreshSupersededError extends Error {
  constructor(siteId: number) {
    super(`采集站 ${siteId} 的刷新结果已过期，未写入本地状态`);
  }
}

export function refreshCompletion(overview: CollectionOverview) {
  const error = overview.errors.length > 0 ? overview.errors.join("；") : null;
  return {
    status: error ? "partial" as const : "success" as const,
    error,
    groupCount: overview.rates?.length ?? 0,
  };
}

type RefreshCompletion = ReturnType<typeof refreshCompletion>;

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
