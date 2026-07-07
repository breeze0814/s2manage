import type { DatabaseSync } from "node:sqlite";
import {
  defaultBotSettings,
  defaultBotCommandSettings,
  defaultProxySettings,
  defaultWorkerSettings,
  type AppConfig,
  type BotCommandSettings,
  type BotSettings,
  type GroupRuleSettings,
  type ProxySettings,
  type SourceSiteConfig,
  type TargetAccountSnapshot,
  type TargetGroupSnapshot,
  type TargetSettings,
  type WorkerSettings,
} from "./app-config.ts";
import { all, bool, int, nullableNumber, number, one, optionalText, text, type SqliteRow } from "./sqlite-utils.ts";

export function readAppConfig(database: DatabaseSync): AppConfig {
  return {
    target: readTarget(database),
    bot: readBot(database),
    proxy: readProxy(database),
    worker: readWorker(database),
    targetGroups: readTargetGroups(database),
    accounts: readTargetAccounts(database),
    sources: readSources(database),
    groupRules: readGroupRules(database),
  };
}

function readTarget(database: DatabaseSync): TargetSettings | null {
  const row = one(database, "SELECT name, base_url, admin_api_key FROM target_settings WHERE id = 1");
  if (!row) return null;
  return { name: text(row.name), baseUrl: text(row.base_url), adminApiKey: text(row.admin_api_key) };
}

function readBot(database: DatabaseSync): BotSettings {
  const row = one(database, "SELECT * FROM bot_settings WHERE id = 1");
  if (!row) return defaultBotSettings;
  return {
    enabled: bool(row.enabled),
    wsUrl: text(row.ws_url),
    token: text(row.token),
    targetGroupId: text(row.target_group_id),
    mentionCommandEnabled: bool(row.mention_command_enabled),
    commandSettings: botCommandSettings(row.command_settings_json),
    activePrivateMessageEnabled: bool(row.active_private_message_enabled),
    scheduledStatsEnabled: bool(row.scheduled_stats_enabled),
    inviteActivityStartDate: text(row.invite_activity_start_date),
    inviteActivityActiveRewardAmount: nullableNumber(row.invite_activity_active_reward_amount),
    inviteActivityInactiveRewardAmount: nullableNumber(row.invite_activity_inactive_reward_amount),
    botUserId: text(row.bot_user_id),
  };
}

function botCommandSettings(value: unknown): BotCommandSettings {
  const parsed = value === null || value === undefined ? {} : JSON.parse(text(value)) as Partial<BotCommandSettings>;
  return { ...defaultBotCommandSettings, ...parsed };
}

function readProxy(database: DatabaseSync): ProxySettings {
  const row = one(database, "SELECT * FROM proxy_settings WHERE id = 1");
  if (!row) return defaultProxySettings;
  return { enabled: bool(row.enabled), httpProxy: text(row.http_proxy), httpsProxy: text(row.https_proxy) };
}

function readWorker(database: DatabaseSync): WorkerSettings {
  const row = one(database, "SELECT * FROM worker_settings WHERE id = 1");
  if (!row) return defaultWorkerSettings;
  return { intervalSeconds: int(row.interval_seconds) };
}

function readTargetGroups(database: DatabaseSync): TargetGroupSnapshot[] {
  return all(database, "SELECT * FROM target_groups ORDER BY id").map((row) => ({
    id: int(row.id),
    name: text(row.name),
    status: text(row.status),
    rate_multiplier: nullableNumber(row.rate_multiplier),
  }));
}

function readTargetAccounts(database: DatabaseSync): TargetAccountSnapshot[] {
  return all(database, "SELECT * FROM target_accounts ORDER BY id").map((row) => ({
    id: int(row.id),
    name: text(row.name),
    platform: text(row.platform),
    status: text(row.status),
    schedulable: bool(row.schedulable),
    rateMultiplier: nullableNumber(row.rate_multiplier),
    priority: nullableInt(row.priority),
    groupIds: numberArray(row.group_ids),
  }));
}

function nullableInt(value: unknown) {
  return value === null || value === undefined ? null : int(value);
}

function numberArray(value: unknown) {
  const parsed = JSON.parse(text(value)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Invalid number array from database");
  return parsed.map((item) => int(item));
}

function readGroupRules(database: DatabaseSync): GroupRuleSettings[] {
  return all(database, "SELECT * FROM group_rules ORDER BY target_group_id").map((row) => ({
    targetGroupId: int(row.target_group_id),
    targetGroupName: text(row.target_group_name),
    currentRate: nullableNumber(row.current_rate),
    enabled: bool(row.enabled),
    mode: text(row.mode) as GroupRuleSettings["mode"],
    offset: number(row.offset),
    multiplier: number(row.multiplier),
    formula: text(row.formula),
    sourceGroupIds: sourceGroupIds(row),
  }));
}

function sourceGroupIds(row: SqliteRow) {
  const parsed = JSON.parse(text(row.source_group_ids)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Invalid source_group_ids from database");
  const ids = parsed.map((value) => String(value).trim()).filter(Boolean);
  return ids.length > 0 ? ids : legacySourceGroupId(row);
}

function legacySourceGroupId(row: SqliteRow) {
  const value = text(row.source_group_id).trim();
  return value ? [value] : [];
}

function readSources(database: DatabaseSync): SourceSiteConfig[] {
  return all(database, "SELECT id FROM source_sites ORDER BY id").map((row) => readSource(database, int(row.id)));
}

export function readSource(database: DatabaseSync, id: number): SourceSiteConfig {
  const site = one(database, "SELECT * FROM source_sites WHERE id = :id", { id });
  if (!site) throw new Error(`Source site ${id} was not saved`);
  return { ...sourceSite(site), account: readAccount(database, id), rates: readRates(database, id) };
}

function sourceSite(row: SqliteRow): Omit<SourceSiteConfig, "account" | "rates"> {
  return {
    id: int(row.id),
    name: text(row.name),
    siteType: text(row.site_type) as SourceSiteConfig["siteType"],
    baseUrl: text(row.base_url),
    authMode: text(row.auth_mode) as SourceSiteConfig["authMode"],
    accessToken: text(row.access_token),
    rtToken: text(row.rt_token),
    username: text(row.username),
    password: text(row.password),
    rechargeRatio: number(row.recharge_ratio),
    intervalSeconds: int(row.interval_seconds),
    useProxy: bool(row.use_proxy),
    updatedAt: text(row.updated_at),
  };
}

function readAccount(database: DatabaseSync, sourceSiteId: number) {
  const row = one(database, "SELECT * FROM source_accounts WHERE source_site_id = :sourceSiteId", { sourceSiteId });
  if (!row) return null;
  return { sourceSiteId, label: text(row.label), balance: nullableNumber(row.balance) };
}

function readRates(database: DatabaseSync, sourceSiteId: number) {
  return all(database, "SELECT * FROM source_rates WHERE source_site_id = :sourceSiteId ORDER BY group_id", {
    sourceSiteId,
  }).map((row) => ({
    sourceSiteId,
    groupId: text(row.group_id),
    groupName: text(row.group_name),
    platform: optionalText(row.platform),
    rawRate: nullableNumber(row.raw_rate),
    effectiveRate: number(row.effective_rate),
    collectedAt: new Date(text(row.collected_at)),
  }));
}
