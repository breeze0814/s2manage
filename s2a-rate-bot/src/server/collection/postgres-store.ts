import type { PoolClient } from "pg";
import type { SourceRateSnapshot } from "../../adapters/source-rates.ts";
import { execute, postgresTransaction, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import { readPostgresChanges, readPostgresRuns } from "./postgres-history.ts";
import { readPostgresRateCatalog, readPostgresRates, setPostgresRateGroupType, setPostgresRatePlatform } from "./postgres-rate-catalog.ts";
import { compareRateSnapshots, type PendingRateChange } from "./rate-changes.ts";
import { CollectionRefreshSupersededError, refreshCompletion, type CollectionStore, type RefreshFailure, type RefreshSuccess, type SiteWrite } from "./store.ts";
import type { CollectionSiteStored } from "./types.ts";

const MISSING_BINDINGS_RULE_ERROR = "绑定的采集分组已删除，倍率规则已自动停用";

export function createPostgresCollectionStore(context: PostgresContext): CollectionStore {
  return {
    create: (site) => createSite(context, site),
    update: (id, site) => updateSite(context, id, site),
    get: (id) => readSite(context, id),
    list: async () => (await rows<Record<string, unknown>>(context,
      "SELECT * FROM collection_sites ORDER BY id")).map(mapSite),
    delete: (id) => deleteSite(context, id),
    beginRefresh: (id) => beginRefresh(context, id),
    recordSuccess: (input) => recordSuccess(context, input),
    recordFailure: (input) => recordFailure(context, input),
    rates: (siteId) => readPostgresRates(context, siteId),
    catalog: (siteId) => readPostgresRateCatalog(context, siteId),
    setRatePlatform: (siteId, groupId, platform) => setPostgresRatePlatform(context, { siteId, groupId, platform }),
    setRateGroupType: (siteId, groupId, groupType) => setPostgresRateGroupType(context, { siteId, groupId, groupType }),
    changes: (query) => readPostgresChanges(context, query),
    runs: (query) => readPostgresRuns(context, query),
    close: async () => undefined,
  };
}

async function createSite(context: PostgresContext, site: SiteWrite) {
  const timestamp = new Date().toISOString();
  const value = await row<Record<string, unknown>>(context, `${siteInsertSql()} VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
  siteValues(site, timestamp));
  if (!value) throw new Error("采集站创建失败");
  return mapSite(value);
}

async function updateSite(context: PostgresContext, id: number, site: SiteWrite) {
  const timestamp = new Date().toISOString();
  const values = [...siteValues(site, timestamp).slice(0, -1), id];
  const value = await row<Record<string, unknown>>(context, `UPDATE collection_sites SET
    name=$1,remark=$2,site_type=$3,base_url=$4,website_url=$5,auth_mode=$6,username=$7,
    new_api_user_id=$8,password_enc=$9,access_token_enc=$10,refresh_token_enc=$11,recharge_ratio=$12,
    balance_alert_threshold=$13,interval_seconds=$14,use_proxy=$15,enabled=$16,
    updated_at=$17,refresh_version=refresh_version+1 WHERE id=$18 RETURNING *`, values);
  if (!value) throw new Error(`采集站不存在: ${id}`);
  return mapSite(value);
}

function siteInsertSql() {
  return `INSERT INTO collection_sites (name,remark,site_type,base_url,website_url,auth_mode,username,
    new_api_user_id,password_enc,access_token_enc,refresh_token_enc,recharge_ratio,balance_alert_threshold,
    interval_seconds,use_proxy,enabled,created_at,updated_at)`;
}

function siteValues(site: SiteWrite, timestamp: string) {
  return [site.name, site.remark ?? "", site.siteType, site.baseUrl, site.websiteUrl, site.authMode,
    site.username, site.newApiUserId, site.passwordEnc, site.accessTokenEnc, site.refreshTokenEnc,
    site.rechargeRatio, site.balanceAlertThreshold ?? null, site.intervalSeconds,
    flag(site.useProxy), flag(site.enabled), timestamp, timestamp];
}

async function readSite(context: PostgresContext, id: number) {
  const value = await row<Record<string, unknown>>(context, "SELECT * FROM collection_sites WHERE id=$1", [id]);
  return value ? mapSite(value) : null;
}

async function deleteSite(context: PostgresContext, id: number) {
  const result = await execute(context, "DELETE FROM collection_sites WHERE id=$1", [id]);
  if (result.rowCount !== 1) throw new Error(`采集站不存在: ${id}`);
}

async function beginRefresh(context: PostgresContext, id: number) {
  const value = await row<{ refresh_version: number }>(context, `UPDATE collection_sites
    SET refresh_version=refresh_version+1 WHERE id=$1 RETURNING refresh_version`, [id]);
  if (!value) throw new Error(`采集站不存在: ${id}`);
  return Number(value.refresh_version);
}

async function recordSuccess(context: PostgresContext, input: RefreshSuccess) {
  const finishedAt = new Date().toISOString();
  const completion = refreshCompletion(input.overview);
  await postgresTransaction(context, async (client) => {
    await assertCurrentRefresh(client, input.siteId, input.refreshVersion);
    await updateCompletedSite(client, { input, completion, finishedAt });
    const runId = await insertRun(client, { siteId: input.siteId, ...completion,
      startedAt: input.startedAt, finishedAt });
    if (input.overview.rates === null) return;
    const previous = await currentRateIdentities(client, input.siteId);
    const changes = compareRateSnapshots(previous, input.overview.rates);
    await insertChanges(client, runId, input.siteId, changes, finishedAt);
    await replaceRates(client, input.siteId, input.overview.rates);
    await removeMissingBindings(client, input.siteId, finishedAt);
  });
}

async function recordFailure(context: PostgresContext, input: RefreshFailure) {
  const finishedAt = new Date().toISOString();
  await postgresTransaction(context, async (client) => {
    await assertCurrentRefresh(client, input.siteId, input.refreshVersion);
    await client.query(`UPDATE collection_sites SET last_run_at=$2,last_status='failed',last_error=$3,
      consecutive_failures=consecutive_failures+1,updated_at=$2 WHERE id=$1`,
    [input.siteId, finishedAt, input.error]);
    await insertRun(client, { siteId: input.siteId, status: "failed", error: input.error,
      groupCount: 0, startedAt: input.startedAt, finishedAt });
  });
}

async function assertCurrentRefresh(client: PoolClient, siteId: number, refreshVersion: number) {
  const result = await client.query<{ refresh_version: number }>(
    "SELECT refresh_version FROM collection_sites WHERE id=$1 FOR UPDATE", [siteId]);
  if (Number(result.rows[0]?.refresh_version) !== refreshVersion) throw new CollectionRefreshSupersededError(siteId);
}

async function currentRateIdentities(client: PoolClient, siteId: number) {
  const result = await client.query<Record<string, unknown>>(
    "SELECT group_id,group_name,platform,effective_rate FROM collection_group_rates WHERE site_id=$1", [siteId]);
  return result.rows.map((value) => ({ groupId: String(value.group_id), groupName: String(value.group_name),
    platform: nullableText(value.platform) ?? undefined, effectiveRate: Number(value.effective_rate) } as SourceRateSnapshot));
}

async function updateCompletedSite(client: PoolClient, options: Readonly<{
  input: RefreshSuccess;
  completion: ReturnType<typeof refreshCompletion>;
  finishedAt: string;
}>) {
  const { input, completion, finishedAt } = options;
  await client.query(`UPDATE collection_sites SET last_run_at=$2,last_success_at=$2,last_status=$3,last_error=$4,
    consecutive_failures=0,access_token_enc=COALESCE($5,access_token_enc),
    refresh_token_enc=COALESCE($6,refresh_token_enc),updated_at=$2 WHERE id=$1`,
  [input.siteId, finishedAt, completion.status, completion.error,
    input.credentials?.accessTokenEnc ?? null, input.credentials?.refreshTokenEnc ?? null]);
  const account = input.overview.account;
  if (account === null) return;
  await client.query(`UPDATE collection_sites SET account_label=$2,balance=$3,today_consume=$4,
    history_recharge=$5 WHERE id=$1`,
  [input.siteId, account.label, account.balance, account.todayConsume, account.historyRecharge]);
}

async function insertRun(client: PoolClient, input: Readonly<{ siteId: number; status: string; error: string | null;
  groupCount: number; startedAt: string; finishedAt: string }>) {
  const result = await client.query<{ id: number }>(`INSERT INTO collection_runs
    (site_id,status,error,group_count,started_at,finished_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [input.siteId, input.status, input.error, input.groupCount, input.startedAt, input.finishedAt]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("采集运行记录创建失败");
  return id;
}

async function insertChanges(client: PoolClient, runId: number, siteId: number,
  changes: readonly PendingRateChange[], collectedAt: string) {
  for (const change of changes) {
    await client.query(`INSERT INTO collection_rate_changes
      (run_id,site_id,group_id,group_name,platform,change_type,old_rate,new_rate,collected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [runId, siteId, change.groupId, change.groupName,
      change.platform, change.changeType, change.oldRate, change.newRate, collectedAt]);
  }
}

async function replaceRates(client: PoolClient, siteId: number, rates: readonly SourceRateSnapshot[]) {
  await client.query("DELETE FROM collection_group_rates WHERE site_id=$1", [siteId]);
  for (const rate of rates) {
    await client.query(`INSERT INTO collection_group_rates
      (site_id,group_id,group_name,platform,raw_rate,effective_rate,collected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [siteId, rate.groupId, rate.groupName, rate.platform ?? null,
      rate.rawRate, rate.effectiveRate, rate.collectedAt.toISOString()]);
  }
}

async function removeMissingBindings(client: PoolClient, siteId: number, timestamp: string) {
  for (const table of ["target_group_bindings", "target_account_bindings"] as const) {
    await client.query(`DELETE FROM ${table} bindings WHERE bindings.source_site_id=$1 AND NOT EXISTS
      (SELECT 1 FROM collection_group_rates rates WHERE rates.site_id=$1
        AND rates.group_id=bindings.source_group_id)`, [siteId]);
  }
  await client.query(`UPDATE target_group_rules rules SET enabled=0,last_error=$1,updated_at=$2
    WHERE rules.enabled=1 AND NOT EXISTS
      (SELECT 1 FROM target_group_bindings bindings WHERE bindings.group_id=rules.group_id)`,
  [MISSING_BINDINGS_RULE_ERROR, timestamp]);
}

function mapSite(value: Record<string, unknown>): CollectionSiteStored {
  return { id: Number(value.id), name: String(value.name), remark: String(value.remark ?? ""),
    siteType: String(value.site_type) as CollectionSiteStored["siteType"], baseUrl: String(value.base_url),
    websiteUrl: String(value.website_url ?? ""), authMode: String(value.auth_mode) as CollectionSiteStored["authMode"],
    username: String(value.username), newApiUserId: String(value.new_api_user_id ?? ""),
    passwordEnc: String(value.password_enc), accessTokenEnc: String(value.access_token_enc),
    refreshTokenEnc: String(value.refresh_token_enc), rechargeRatio: Number(value.recharge_ratio),
    balanceAlertThreshold: nullableNumber(value.balance_alert_threshold), intervalSeconds: Number(value.interval_seconds),
    useProxy: truthy(value.use_proxy), enabled: truthy(value.enabled), accountLabel: nullableText(value.account_label),
    balance: nullableNumber(value.balance), todayConsume: nullableNumber(value.today_consume),
    historyRecharge: nullableNumber(value.history_recharge), lastRunAt: nullableText(value.last_run_at),
    lastSuccessAt: nullableText(value.last_success_at), lastStatus: nullableText(value.last_status) as CollectionSiteStored["lastStatus"],
    lastError: nullableText(value.last_error), consecutiveFailures: Number(value.consecutive_failures),
    refreshVersion: Number(value.refresh_version) };
}

function flag(value: boolean) { return value ? 1 : 0; }
function truthy(value: unknown) { return value === true || Number(value) === 1; }
function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
