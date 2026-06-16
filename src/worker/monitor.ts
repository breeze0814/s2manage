import { PrismaClient } from "@prisma/client";
import { BlPublicClient, resolveBlChangeNewValue, resolveBlRateMultiplier, type BlChange } from "@/server/clients/bl-public";
import { Sub2ApiAdminClient, type Sub2ApiGroup } from "@/server/clients/sub2api-admin";
import { decrypt } from "@/server/crypto";
import { evaluateGroupRateRule } from "@/server/bl-bindings";
import { collectDueBlCollectionSites } from "@/server/bl-collection/collector";
import { publishRateChangeAnnouncements } from "@/server/announcement-rules";
import { runDueUpstreamMonitors } from "@/server/upstream-monitor";
import { normalizeWorkerIntervalSeconds, workerRuntimeSettingsFromRows } from "@/server/worker-settings";
import { normalizeRateMultiplier, ratesEqual } from "@/server/rates";
import { cleanupOldLogs, writeSyncLog } from "@/server/sync-logs";

const db = new PrismaClient();
const runOnce = process.env.S2A_WORKER_ONCE === "1";
let currentWorkerIntervalSeconds = normalizeWorkerIntervalSeconds(process.env.S2A_WORKER_INTERVAL_SECONDS);
let stopping = false;
let wakeDelay: (() => void) | null = null;

function changeTime(change: BlChange) {
  const timestamp = new Date(change.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestChangesSince(changes: BlChange[], since?: Date | null) {
  const cutoff = since?.getTime() ?? 0;
  const bySourceGroup = new Map<string, BlChange>();
  for (const change of changes) {
    if (changeTime(change) <= cutoff) continue;
    const key = sourceKey(change.site_id, change.group_id);
    const current = bySourceGroup.get(key);
    if (!current || changeTime(change) > changeTime(current)) {
      bySourceGroup.set(key, change);
    }
  }
  return Array.from(bySourceGroup.values()).sort((a, b) => changeTime(a) - changeTime(b));
}

function sourceKey(siteId: number, groupId: string) {
  return `${siteId}:${groupId}`;
}

function findTargetGroup(change: BlChange, groups: Sub2ApiGroup[]) {
  return groups.find((group) => String(group.id) === change.group_id)
    ?? groups.find((group) => change.group_name && group.name.trim() === change.group_name.trim());
}

function formatSourceLabel(sources: Array<{ sourceSiteName?: string | null; sourceGroupId: string; sourceGroupName?: string | null }>) {
  if (sources.length === 0) return null;
  return sources
    .map((source) => `${source.sourceSiteName || "BL"} / ${source.sourceGroupName || source.sourceGroupId}`)
    .join(", ");
}

async function logSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await writeSyncLog(db, { connectionId, action, target, detail, status, error });
  } catch {
    // Keep the worker moving even if local log persistence fails.
  }
}

async function setWorkerSetting(key: string, value: string) {
  try {
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Failed to write ${key}: ${message}`);
  }
}

async function writeWorkerState(fields: Record<string, string | number | Date | null | undefined>) {
  await Promise.all(Object.entries(fields).map(([key, value]) => {
    if (value === undefined) return Promise.resolve();
    const serialized = value instanceof Date ? value.toISOString() : value === null ? "" : String(value);
    return setWorkerSetting(key, serialized);
  }));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeDelay = null;
      resolve();
    }, ms);
    wakeDelay = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolve();
    };
    const stop = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolve();
    };
    if (stopping) stop();
  });
}

function requestStop() {
  stopping = true;
  wakeDelay?.();
}

function sameRate(left: number, right: number) {
  return ratesEqual(left, right);
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getAccountId(account: unknown) {
  if (!account || typeof account !== "object") return null;
  const numeric = Number((account as { id?: unknown }).id);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function getAccountName(account: unknown, accountId: number) {
  if (!account || typeof account !== "object") return `#${accountId}`;
  const row = account as { name?: unknown; username?: unknown };
  const name = typeof row.name === "string" && row.name.trim()
    ? row.name.trim()
    : typeof row.username === "string" && row.username.trim()
      ? row.username.trim()
      : "";
  return name || `#${accountId}`;
}

function getAccountRate(account: unknown) {
  if (!account || typeof account !== "object") return null;
  return toFiniteNumber((account as { rate_multiplier?: unknown }).rate_multiplier);
}

async function applyCurrentBoundGroupRules(input: {
  connectionId: number;
  connectionName?: string | null;
  blClient: BlPublicClient;
  s2Client: Sub2ApiAdminClient;
  groups: Sub2ApiGroup[];
}) {
  const allBindings = await db.blSourceBinding.findMany({
    where: { connectionId: input.connectionId, targetType: "group" },
    orderBy: [{ targetId: "asc" }, { sourceSiteName: "asc" }, { sourceGroupName: "asc" }],
  });
  const boundGroupIds = new Set<number>();
  for (const binding of allBindings) {
    boundGroupIds.add(binding.targetId);
  }
  if (boundGroupIds.size === 0) return new Set<number>();

  const boundIds = Array.from(boundGroupIds);
  const rules = await db.blGroupRateRule.findMany({ where: { connectionId: input.connectionId, groupId: { in: boundIds }, enabled: true } });
  const enabledRuleGroupIds = new Set(rules.map((rule) => rule.groupId));
  if (enabledRuleGroupIds.size === 0) return boundGroupIds;

  const rates = await input.blClient.fetchRates();
  const rulesByGroup = new Map(rules.map((rule) => [rule.groupId, rule]));
  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const ratesBySource = new Map(rates.map((rate) => [sourceKey(rate.site_id, rate.group_id), rate]));
  const bindingsByGroup = new Map<number, typeof allBindings>();
  for (const binding of allBindings) {
    const current = bindingsByGroup.get(binding.targetId) ?? [];
    current.push(binding);
    bindingsByGroup.set(binding.targetId, current);
  }

  for (const groupId of enabledRuleGroupIds) {
    const target = groupsById.get(groupId);
    const bindings = bindingsByGroup.get(groupId) ?? [];
    const rule = rulesByGroup.get(groupId);
    if (!target) {
      const message = "No target group found for bound BL rule";
      await logSync(input.connectionId, "auto_bl_bound_group_rule", `group:${groupId}`, { groupId }, "failed", message);
      continue;
    }
    if (!rule) continue;

    const sources = bindings.map((binding) => {
      const rate = ratesBySource.get(sourceKey(binding.sourceSiteId, binding.sourceGroupId));
      return {
        sourceSiteId: binding.sourceSiteId,
        sourceSiteName: binding.sourceSiteName,
        sourceGroupId: binding.sourceGroupId,
        sourceGroupName: binding.sourceGroupName ?? "",
        currentRate: resolveBlRateMultiplier(rate),
        rawRate: typeof rate?.rate_multiplier === "number" ? rate.rate_multiplier : null,
        rechargeRatio: typeof rate?.recharge_ratio === "number" ? rate.recharge_ratio : null,
      };
    });

    try {
      const currentRate = typeof target.rate_multiplier === "number" ? target.rate_multiplier : 1;
      const rateMultiplier = evaluateGroupRateRule({
        rule: { enabled: rule.enabled, mode: rule.mode as "first" | "average" | "min" | "max" | "custom", offset: rule.offset, expression: rule.expression },
        sourceRates: sources.map((source) => source.currentRate),
        currentRate,
      });
      const detail = {
        targetGroupId: target.id,
        targetGroupName: target.name,
        rule: { enabled: rule.enabled, mode: rule.mode, offset: rule.offset, expression: rule.expression },
        sources,
        currentRate,
        rateMultiplier,
      };

      if (sameRate(currentRate, rateMultiplier)) {
        console.log(`  SKIP: bound rule -> group ${target.name} already ${rateMultiplier}`);
        continue;
      }

      await input.s2Client.updateGroupRateMultiplier(target.id, rateMultiplier);
      const firstSource = sources[0];
      await publishRateChangeAnnouncements({
        db,
        client: input.s2Client,
        context: {
          action: "auto_bl_bound_group_rule",
          connectionId: input.connectionId,
          connectionName: input.connectionName,
          groupId: target.id,
          groupName: target.name,
          oldRate: target.rate_multiplier ?? null,
          newRate: rateMultiplier,
          sourceSiteId: firstSource?.sourceSiteId,
          sourceSiteName: firstSource?.sourceSiteName,
          sourceGroupId: firstSource?.sourceGroupId,
          sourceGroupName: firstSource?.sourceGroupName,
          sourceRate: firstSource?.currentRate,
          sourceLabel: formatSourceLabel(sources),
          ruleMode: rule?.mode ?? "first",
          ruleExpression: rule?.expression,
          changedAt: new Date(),
        },
      });
      await logSync(input.connectionId, "auto_bl_bound_group_rule", `group:${target.id}`, detail, "success");
      console.log(`  OK: bound rule -> group ${target.name}=${rateMultiplier}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logSync(input.connectionId, "auto_bl_bound_group_rule", `group:${target.id}`, {
        targetGroupId: target.id,
        targetGroupName: target.name,
        sources,
      }, "failed", message);
      console.error(`  FAIL: bound rule for group ${target.name}: ${message}`);
    }
  }

  return boundGroupIds;
}

async function applyCurrentBoundAccountRules(input: {
  connectionId: number;
  blClient: BlPublicClient;
  s2Client: Sub2ApiAdminClient;
  accounts: unknown[];
}) {
  const allBindings = await db.blSourceBinding.findMany({
    where: { connectionId: input.connectionId, targetType: "account" },
    orderBy: [{ targetId: "asc" }, { sourceSiteName: "asc" }, { sourceGroupName: "asc" }],
  });
  const boundAccountIds = new Set<number>();
  for (const binding of allBindings) {
    boundAccountIds.add(binding.targetId);
  }
  if (boundAccountIds.size === 0) return;

  const boundIds = Array.from(boundAccountIds);
  const rules = await db.blAccountRateRule.findMany({ where: { connectionId: input.connectionId, accountId: { in: boundIds }, enabled: true } });
  if (rules.length === 0) return;

  const rates = await input.blClient.fetchRates();
  const rulesByAccount = new Map(rules.map((rule) => [rule.accountId, rule]));
  const accountsById = new Map<number, unknown>();
  for (const account of input.accounts) {
    const accountId = getAccountId(account);
    if (accountId) accountsById.set(accountId, account);
  }
  const ratesBySource = new Map(rates.map((rate) => [sourceKey(rate.site_id, rate.group_id), rate]));
  const bindingsByAccount = new Map<number, typeof allBindings>();
  for (const binding of allBindings) {
    const current = bindingsByAccount.get(binding.targetId) ?? [];
    current.push(binding);
    bindingsByAccount.set(binding.targetId, current);
  }

  for (const accountId of rulesByAccount.keys()) {
    const target = accountsById.get(accountId);
    const bindings = bindingsByAccount.get(accountId) ?? [];
    const rule = rulesByAccount.get(accountId);
    if (!target) {
      const message = "No target account found for bound BL rule";
      await logSync(input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, { accountId }, "failed", message);
      continue;
    }
    if (!rule) continue;

    const accountName = getAccountName(target, accountId);
    const sources = bindings.map((binding) => {
      const rate = ratesBySource.get(sourceKey(binding.sourceSiteId, binding.sourceGroupId));
      return {
        sourceSiteId: binding.sourceSiteId,
        sourceSiteName: binding.sourceSiteName,
        sourceGroupId: binding.sourceGroupId,
        sourceGroupName: binding.sourceGroupName ?? "",
        currentRate: resolveBlRateMultiplier(rate),
        rawRate: typeof rate?.rate_multiplier === "number" ? rate.rate_multiplier : null,
        rechargeRatio: typeof rate?.recharge_ratio === "number" ? rate.recharge_ratio : null,
      };
    });

    try {
      const currentRate = getAccountRate(target) ?? 1;
      const rateMultiplier = evaluateGroupRateRule({
        rule: { enabled: rule.enabled, mode: rule.mode as "first" | "average" | "min" | "max" | "custom", offset: rule.offset, expression: rule.expression },
        sourceRates: sources.map((source) => source.currentRate),
        currentRate,
      });
      const detail = {
        targetAccountId: accountId,
        targetAccountName: accountName,
        rule: { enabled: rule.enabled, mode: rule.mode, offset: rule.offset, expression: rule.expression },
        sources,
        currentRate,
        rateMultiplier,
      };

      if (sameRate(currentRate, rateMultiplier)) {
        console.log(`  SKIP: bound rule -> account ${accountName} already ${rateMultiplier}`);
        continue;
      }

      await input.s2Client.updateAccount(accountId, { rate_multiplier: rateMultiplier });
      await logSync(input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, detail, "success");
      console.log(`  OK: bound rule -> account ${accountName}=${rateMultiplier}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logSync(input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, {
        targetAccountId: accountId,
        targetAccountName: accountName,
        sources,
      }, "failed", message);
      console.error(`  FAIL: bound rule for account ${accountName}: ${message}`);
    }
  }
}

async function runCycle() {
  const cycleStartedAt = new Date();
  const settings = await db.setting.findMany();
  const runtimeSettings = workerRuntimeSettingsFromRows(settings);
  currentWorkerIntervalSeconds = runtimeSettings.workerIntervalSeconds;

  await writeWorkerState({
    worker_heartbeat_at: cycleStartedAt,
    worker_last_run_started_at: cycleStartedAt,
    worker_last_run_status: "running",
    worker_last_run_message: "worker cycle running",
    worker_interval_seconds: runtimeSettings.workerIntervalSeconds,
    upstream_monitor_timeout_seconds: runtimeSettings.upstreamMonitorTimeoutSeconds,
    upstream_monitor_concurrency: runtimeSettings.upstreamMonitorConcurrency,
    worker_next_run_at: null,
  });

  try {
    const collected = await collectDueBlCollectionSites();
    const success = collected.filter((row) => row.result.ok).length;
    const failed = collected.length - success;
    console.log(`[worker] Rate collection checked ${collected.length} due source(s), success=${success}, failed=${failed}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Rate collection error: ${message}`);
  }

  try {
    await cleanupOldLogs(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Log cleanup error: ${message}`);
  }

  const autoConns = await db.connection.findMany({ where: { enabled: true, syncMode: "auto" } });

  if (autoConns.length === 0) {
    console.log("[worker] No auto-sync connections found");
  }

  for (const conn of autoConns) {
    const blClient = new BlPublicClient(conn.id);
    console.log(`\n[worker] Processing: ${conn.name} (${conn.baseUrl})`);
    const checkedAt = new Date();
    try {
      const s2Client = new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
      const [changes, groupsList] = await Promise.all([
        blClient.fetchChanges(undefined, 200),
        s2Client.listGroups(),
      ]);
      const pendingChanges = latestChangesSince(changes, conn.lastCheckAt);

      const boundGroupIds = await applyCurrentBoundGroupRules({
        connectionId: conn.id,
        connectionName: conn.name,
        blClient,
        s2Client,
        groups: groupsList,
      });
      try {
        const accountsList = await s2Client.listAccounts();
        await applyCurrentBoundAccountRules({
          connectionId: conn.id,
          blClient,
          s2Client,
          accounts: accountsList,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAIL: account bound rules: ${message}`);
        await logSync(conn.id, "auto_bl_bound_account_rule", `connection:${conn.id}`, {}, "failed", message);
      }

      if (pendingChanges.length === 0) {
        console.log("  No new changes to sync");
        await db.connection.update({ where: { id: conn.id }, data: { lastCheckAt: checkedAt } });
        continue;
      }

      for (const change of pendingChanges) {
        const target = findTargetGroup(change, groupsList);
        const resolvedRateMultiplier = resolveBlChangeNewValue(change);
        if (!target) {
          const message = "No target group matched by id or name";
          console.warn(`  SKIP: ${change.group_id}: ${message}`);
          continue;
        }
        if (resolvedRateMultiplier === null) {
          const message = "Invalid rate multiplier";
          console.warn(`  SKIP: ${change.group_id}: ${message}`);
          await logSync(conn.id, "auto_bl_sync_group_rate", `group:${target.id}`, { sourceGroupId: change.group_id, newValue: change.new_value }, "failed", message);
          continue;
        }
        const rateMultiplier = normalizeRateMultiplier(resolvedRateMultiplier);
        if (boundGroupIds.has(target.id)) {
          console.log(`  SKIP: group ${target.name}: bound rule already applied`);
          continue;
        }
        const currentRate = typeof target.rate_multiplier === "number" ? target.rate_multiplier : null;
        if (currentRate !== null && sameRate(currentRate, rateMultiplier)) {
          console.log(`  SKIP: group ${target.name} already ${rateMultiplier}`);
          continue;
        }

        const detail = {
          sourceSiteId: change.site_id,
          sourceSiteName: change.site_name,
          sourceGroupId: change.group_id,
          sourceGroupName: change.group_name ?? "",
          targetGroupId: target.id,
          targetGroupName: target.name,
          rateMultiplier,
          rawRateMultiplier: change.new_value,
          rechargeRatio: change.recharge_ratio,
        };
        try {
          await s2Client.updateGroupRateMultiplier(target.id, rateMultiplier);
          const changedAt = new Date(change.created_at);
          await publishRateChangeAnnouncements({
            db,
            client: s2Client,
            context: {
              action: "auto_bl_sync_group_rate",
              connectionId: conn.id,
              connectionName: conn.name,
              groupId: target.id,
              groupName: target.name,
              oldRate: currentRate,
              newRate: rateMultiplier,
              sourceSiteId: change.site_id,
              sourceSiteName: change.site_name,
              sourceGroupId: change.group_id,
              sourceGroupName: change.group_name ?? "",
              sourceRate: rateMultiplier,
              changedAt: Number.isFinite(changedAt.getTime()) ? changedAt : new Date(),
            },
          });
          await logSync(conn.id, "auto_bl_sync_group_rate", `group:${target.id}`, detail, "success");
          console.log(`  OK: ${change.group_id}=${rateMultiplier} -> group ${target.name}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  FAIL: group ${target.name}: ${message}`);
          await logSync(conn.id, "auto_bl_sync_group_rate", `group:${target.id}`, detail, "failed", message);
        }
      }

      await db.connection.update({ where: { id: conn.id }, data: { lastCheckAt: checkedAt } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Connection error: ${message}`);
      await logSync(conn.id, "auto_bl_sync_connection", `connection:${conn.id}`, {}, "failed", message);
    }
    await writeWorkerState({ worker_heartbeat_at: new Date() });
  }

  try {
    const checked = await runDueUpstreamMonitors(db, new Date(), {
      timeoutMs: runtimeSettings.upstreamMonitorTimeoutSeconds * 1000,
      concurrency: runtimeSettings.upstreamMonitorConcurrency,
      onProgress: async () => {
        await writeWorkerState({ worker_heartbeat_at: new Date() });
      },
    });
    console.log(`[worker] Upstream monitor checked ${checked} due rule(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Upstream monitor error: ${message}`);
  }

  const finishedAt = new Date();
  const nextRunAt = runOnce ? null : new Date(cycleStartedAt.getTime() + runtimeSettings.workerIntervalSeconds * 1000);
  await writeWorkerState({
    worker_heartbeat_at: finishedAt,
    worker_last_run_finished_at: finishedAt,
    worker_last_run_status: "success",
    worker_last_run_message: "worker cycle completed",
    worker_last_run_duration_ms: finishedAt.getTime() - cycleStartedAt.getTime(),
    worker_interval_seconds: runtimeSettings.workerIntervalSeconds,
    upstream_monitor_timeout_seconds: runtimeSettings.upstreamMonitorTimeoutSeconds,
    upstream_monitor_concurrency: runtimeSettings.upstreamMonitorConcurrency,
    worker_next_run_at: nextRunAt,
  });

  console.log("\n[worker] Cycle done");
  return { nextRunAt, intervalSeconds: runtimeSettings.workerIntervalSeconds };
}

async function main() {
  const startedAt = new Date();
  try {
    currentWorkerIntervalSeconds = workerRuntimeSettingsFromRows(await db.setting.findMany()).workerIntervalSeconds;
  } catch {
    currentWorkerIntervalSeconds = normalizeWorkerIntervalSeconds(process.env.S2A_WORKER_INTERVAL_SECONDS);
  }
  console.log(`[worker] S2A Manager auto-sync worker started, interval=${currentWorkerIntervalSeconds}s, once=${runOnce ? "yes" : "no"}`);
  await writeWorkerState({
    worker_started_at: startedAt,
    worker_heartbeat_at: startedAt,
    worker_interval_seconds: currentWorkerIntervalSeconds,
    worker_last_run_message: "worker started",
  });

  while (!stopping) {
    let nextRunAt: Date | null = null;
    try {
      const result = await runCycle();
      nextRunAt = result.nextRunAt;
      currentWorkerIntervalSeconds = result.intervalSeconds;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date();
      console.error(`[worker] Cycle failed: ${message}`);
      await writeWorkerState({
        worker_heartbeat_at: failedAt,
        worker_last_run_finished_at: failedAt,
        worker_last_run_status: "failed",
        worker_last_run_message: message,
        worker_next_run_at: runOnce ? null : new Date(failedAt.getTime() + currentWorkerIntervalSeconds * 1000),
      });
      nextRunAt = runOnce ? null : new Date(failedAt.getTime() + currentWorkerIntervalSeconds * 1000);
    }

    if (runOnce || stopping) break;
    const delayMs = Math.max(0, (nextRunAt?.getTime() ?? Date.now() + currentWorkerIntervalSeconds * 1000) - Date.now());
    await delay(delayMs);
  }

  await writeWorkerState({
    worker_heartbeat_at: new Date(),
    worker_last_run_message: stopping ? "worker stopped" : "worker completed",
  });
  await db.$disconnect();
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

main().catch(async (error) => {
  console.error(error);
  await writeWorkerState({
    worker_heartbeat_at: new Date(),
    worker_last_run_status: "failed",
    worker_last_run_message: error instanceof Error ? error.message : String(error),
  });
  await db.$disconnect();
  process.exit(1);
});
