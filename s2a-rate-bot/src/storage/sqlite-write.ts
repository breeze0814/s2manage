import type { DatabaseSync } from "node:sqlite";
import type {
  BotSettings,
  GroupRuleSettings,
  ProxySettings,
  SourceOverviewInput,
  TargetAccountSnapshot,
  TargetGroupSnapshot,
  TargetSettings,
  WorkerSettings,
} from "./app-config.ts";
import { execute, flag, nowIso, transaction, type SqliteBindings } from "./sqlite-utils.ts";

export function saveTarget(database: DatabaseSync, settings: TargetSettings) {
  execute(database, `
    INSERT INTO target_settings (id, name, base_url, admin_api_key, updated_at)
    VALUES (1, :name, :baseUrl, :adminApiKey, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name,
      base_url = excluded.base_url, admin_api_key = excluded.admin_api_key,
      updated_at = excluded.updated_at
  `, { ...settings, updatedAt: nowIso() });
}

export function saveBot(database: DatabaseSync, settings: BotSettings) {
  execute(database, `
    INSERT INTO bot_settings (
      id, enabled, ws_url, token, target_group_id, mention_command_enabled,
      command_settings_json, active_private_message_enabled, scheduled_stats_enabled,
      invite_activity_start_date, invite_activity_active_reward_amount, invite_activity_inactive_reward_amount,
      bot_user_id, updated_at
    )
    VALUES (
      1, :enabled, :wsUrl, :token, :targetGroupId, :mention, :commandSettings,
      :activePrivateMessage, :scheduledStats, :inviteActivityStartDate,
      :inviteActivityActiveRewardAmount, :inviteActivityInactiveRewardAmount,
      :botUserId, :updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, ws_url = excluded.ws_url,
      token = excluded.token, target_group_id = excluded.target_group_id,
      mention_command_enabled = excluded.mention_command_enabled,
      command_settings_json = excluded.command_settings_json,
      active_private_message_enabled = excluded.active_private_message_enabled,
      scheduled_stats_enabled = excluded.scheduled_stats_enabled,
      invite_activity_start_date = excluded.invite_activity_start_date,
      invite_activity_active_reward_amount = excluded.invite_activity_active_reward_amount,
      invite_activity_inactive_reward_amount = excluded.invite_activity_inactive_reward_amount,
      bot_user_id = excluded.bot_user_id, updated_at = excluded.updated_at
  `, botBindings(settings));
}

export function saveProxy(database: DatabaseSync, settings: ProxySettings) {
  execute(database, `
    INSERT INTO proxy_settings VALUES (1, :enabled, :httpProxy, :httpsProxy, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled,
      http_proxy = excluded.http_proxy, https_proxy = excluded.https_proxy,
      updated_at = excluded.updated_at
  `, proxyBindings(settings));
}

export function saveWorker(database: DatabaseSync, settings: WorkerSettings) {
  execute(database, `
    INSERT INTO worker_settings VALUES (1, :intervalSeconds, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET interval_seconds = excluded.interval_seconds,
      updated_at = excluded.updated_at
  `, { intervalSeconds: settings.intervalSeconds, updatedAt: nowIso() });
}

export function saveTargetGroups(database: DatabaseSync, groups: readonly TargetGroupSnapshot[]) {
  for (const group of groups) saveTargetGroup(database, group);
}

export function saveTargetGroup(database: DatabaseSync, group: TargetGroupSnapshot) {
  execute(database, `
    INSERT INTO target_groups VALUES (:id, :name, :status, :rateMultiplier, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status,
      rate_multiplier = excluded.rate_multiplier, updated_at = excluded.updated_at
  `, targetGroupBindings(group));
}

export function saveTargetAccounts(database: DatabaseSync, accounts: readonly TargetAccountSnapshot[]) {
  transaction(database, () => {
    execute(database, "DELETE FROM target_accounts");
    for (const account of accounts) saveTargetAccount(database, account);
  });
}

export function saveTargetAccount(database: DatabaseSync, account: TargetAccountSnapshot) {
  execute(database, `
    INSERT INTO target_accounts VALUES (
      :id, :name, :platform, :status, :schedulable, :rateMultiplier,
      :priority, :groupIds, :updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, platform = excluded.platform,
      status = excluded.status, schedulable = excluded.schedulable,
      rate_multiplier = excluded.rate_multiplier, priority = excluded.priority,
      group_ids = excluded.group_ids, updated_at = excluded.updated_at
  `, targetAccountBindings(account));
}

export function saveGroupRule(database: DatabaseSync, rule: GroupRuleSettings) {
  execute(database, `
    INSERT INTO group_rules (
      target_group_id, target_group_name, current_rate, enabled, mode, offset,
      source_group_id, source_group_ids, formula, multiplier, updated_at
    )
    VALUES (
      :targetGroupId, :targetGroupName, :currentRate, :enabled, :mode, :offset,
      :sourceGroupId, :sourceGroupIds, :formula, :multiplier, :updatedAt
    )
    ON CONFLICT(target_group_id) DO UPDATE SET target_group_name = excluded.target_group_name,
      current_rate = excluded.current_rate, enabled = excluded.enabled, mode = excluded.mode,
      offset = excluded.offset, source_group_id = excluded.source_group_id,
      source_group_ids = excluded.source_group_ids, formula = excluded.formula,
      multiplier = excluded.multiplier,
      updated_at = excluded.updated_at
  `, ruleBindings(rule));
}

export function saveSourceOverview(database: DatabaseSync, input: SourceOverviewInput) {
  const updatedAt = nowIso();
  transaction(database, () => {
    saveSourceSite(database, input.site, updatedAt);
    saveSourceAccount(database, input.account, updatedAt);
    replaceSourceRates(database, input.site.id, input.rates);
  });
}

function saveSourceSite(database: DatabaseSync, site: SourceOverviewInput["site"], updatedAt: string) {
  execute(database, `
    INSERT INTO source_sites VALUES (:id, :name, :siteType, :baseUrl, :authMode, :accessToken,
      :rtToken, :username, :password, :rechargeRatio, :intervalSeconds, :useProxy, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, site_type = excluded.site_type,
      base_url = excluded.base_url, auth_mode = excluded.auth_mode, access_token = excluded.access_token,
      rt_token = excluded.rt_token, username = excluded.username, password = excluded.password,
      recharge_ratio = excluded.recharge_ratio, interval_seconds = excluded.interval_seconds,
      use_proxy = excluded.use_proxy, updated_at = excluded.updated_at
  `, sourceSiteBindings(site, updatedAt));
}

function saveSourceAccount(database: DatabaseSync, account: SourceOverviewInput["account"], updatedAt: string) {
  execute(database, `
    INSERT INTO source_accounts VALUES (:sourceSiteId, :label, :balance, :updatedAt)
    ON CONFLICT(source_site_id) DO UPDATE SET label = excluded.label,
      balance = excluded.balance, updated_at = excluded.updated_at
  `, { sourceSiteId: account.sourceSiteId, label: account.label, balance: account.balance, updatedAt });
}

function replaceSourceRates(database: DatabaseSync, sourceSiteId: number, rates: SourceOverviewInput["rates"]) {
  execute(database, "DELETE FROM source_rates WHERE source_site_id = :sourceSiteId", { sourceSiteId });
  for (const rate of rates) {
    execute(database, "INSERT INTO source_rates VALUES (:sourceSiteId, :groupId, :groupName, :platform, :rawRate, :effectiveRate, :collectedAt)", {
      sourceSiteId,
      groupId: rate.groupId,
      groupName: rate.groupName,
      platform: rate.platform ?? null,
      rawRate: rate.rawRate,
      effectiveRate: rate.effectiveRate,
      collectedAt: rate.collectedAt.toISOString(),
    });
  }
}

function botBindings(settings: BotSettings): SqliteBindings {
  return {
    enabled: flag(settings.enabled),
    wsUrl: settings.wsUrl,
    token: settings.token,
    targetGroupId: settings.targetGroupId,
    mention: flag(settings.mentionCommandEnabled),
    commandSettings: JSON.stringify(settings.commandSettings),
    activePrivateMessage: flag(settings.activePrivateMessageEnabled),
    scheduledStats: flag(settings.scheduledStatsEnabled),
    inviteActivityStartDate: settings.inviteActivityStartDate,
    inviteActivityActiveRewardAmount: settings.inviteActivityActiveRewardAmount,
    inviteActivityInactiveRewardAmount: settings.inviteActivityInactiveRewardAmount,
    botUserId: settings.botUserId,
    updatedAt: nowIso(),
  };
}

function proxyBindings(settings: ProxySettings): SqliteBindings {
  return {
    enabled: flag(settings.enabled),
    httpProxy: settings.httpProxy,
    httpsProxy: settings.httpsProxy,
    updatedAt: nowIso(),
  };
}

function targetGroupBindings(group: TargetGroupSnapshot): SqliteBindings {
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    rateMultiplier: group.rate_multiplier,
    updatedAt: nowIso(),
  };
}

function targetAccountBindings(account: TargetAccountSnapshot): SqliteBindings {
  return {
    ...account,
    schedulable: flag(account.schedulable),
    groupIds: JSON.stringify(account.groupIds),
    updatedAt: nowIso(),
  };
}

function ruleBindings(rule: GroupRuleSettings): SqliteBindings {
  return {
    ...rule,
    enabled: flag(rule.enabled),
    sourceGroupId: rule.sourceGroupIds[0] ?? "",
    sourceGroupIds: JSON.stringify(rule.sourceGroupIds),
    updatedAt: nowIso(),
  };
}

function sourceSiteBindings(site: SourceOverviewInput["site"], updatedAt: string): SqliteBindings {
  return { ...site, siteType: site.siteType, authMode: site.authMode, useProxy: flag(site.useProxy), updatedAt };
}
