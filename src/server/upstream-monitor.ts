import type { PrismaClient, UpstreamMonitorRule } from "@prisma/client";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { writeSyncLog } from "@/server/sync-logs";
import { getAccountId } from "@/server/account-utils";
import { applyBoundRateRulesForConnection } from "@/server/bl-rate-sync";
import {
  pauseAccountMonitorRateSources,
  restoreAccountMonitorRateSources,
  type MonitorRateExclusionSyncResult,
} from "@/server/upstream-monitor-rate-exclusions";

type MonitorDb = Pick<
  PrismaClient,
  | "connection"
  | "upstreamMonitorRule"
  | "upstreamMonitorResult"
  | "blSourceBinding"
  | "blGroupRateRule"
  | "blAccountRateRule"
  | "announcementRule"
  | "blCollectedChange"
  | "blCollectionSite"
  | "blCollectionRun"
  | "blCollectedGroupRate"
  | "upstreamMonitorRateExclusion"
  | "$transaction"
>;

type RemoteAccount = {
  id?: number | string | null;
  name?: string | null;
  username?: string | null;
  schedulable?: boolean | null;
};

type ExecuteMonitorOptions = {
  db: MonitorDb;
  rule: UpstreamMonitorRule;
  client?: Sub2ApiAdminClient;
  account?: RemoteAccount | null;
  now?: Date;
  reason?: "manual" | "scheduled";
  timeoutMs?: number;
};

type RunDueMonitorOptions = {
  timeoutMs?: number;
  concurrency?: number;
  onProgress?: () => Promise<void>;
};

const monitorResultKeepCount = 100;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(1, minutes) * 60_000);
}

function truncate(value: string, max = 2_000) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function accountLabel(account: RemoteAccount | null | undefined, fallbackId: number) {
  const name = account?.name ?? account?.username;
  return name?.trim() || `#${fallbackId}`;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const limit = Math.min(Math.max(1, Math.floor(concurrency)), Math.max(1, items.length));
  let index = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }));
}

function findAccount(accounts: unknown[], accountId: number) {
  return accounts.find((account) => {
    if (!account || typeof account !== "object") return false;
    return getAccountId(account) === accountId;
  }) as RemoteAccount | undefined;
}

async function getClient(db: MonitorDb, connectionId: number) {
  const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  return new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
}

async function safeLogSync(db: MonitorDb, connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await writeSyncLog(db, { connectionId, action, target, detail, status, error });
  } catch {
    // Monitor logging must not stop account recovery or checks.
  }
}

async function applyMonitorRateExclusionChanges(input: {
  db: MonitorDb;
  connectionId: number;
  accountId: number;
  action: "pause" | "restore";
  result: MonitorRateExclusionSyncResult;
}) {
  if (input.result.count === 0) return;

  try {
    const sync = await applyBoundRateRulesForConnection({
      db: input.db,
      connectionId: input.connectionId,
      sourceSiteIds: input.result.sourceSiteIds,
      changedSources: input.result.changedSources,
      targetGroupIds: input.result.affectedGroupIds,
      cleanupBindings: false,
    });
    await safeLogSync(
      input.db,
      input.connectionId,
      input.action === "pause" ? "upstream_monitor_exclude_group_rate_sources" : "upstream_monitor_restore_group_rate_sources",
      `account:${input.accountId}`,
      {
        accountId: input.accountId,
        affectedGroupIds: input.result.affectedGroupIds,
        changedSources: input.result.changedSources,
        exclusions: input.result.exclusions.slice(0, 80),
        rateRuleSync: sync.summary,
      },
      sync.ok ? "success" : "failed",
      sync.ok ? undefined : sync.message,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeLogSync(
      input.db,
      input.connectionId,
      input.action === "pause" ? "upstream_monitor_exclude_group_rate_sources" : "upstream_monitor_restore_group_rate_sources",
      `account:${input.accountId}`,
      {
        accountId: input.accountId,
        affectedGroupIds: input.result.affectedGroupIds,
        changedSources: input.result.changedSources,
        exclusions: input.result.exclusions.slice(0, 80),
      },
      "failed",
      message,
    );
  }
}

async function pauseMonitorRateSources(input: {
  db: MonitorDb;
  connectionId: number;
  accountId: number;
  accountName?: string | null;
  reason?: string | null;
  pausedAt?: Date;
}) {
  try {
    const result = await pauseAccountMonitorRateSources(input);
    await applyMonitorRateExclusionChanges({ ...input, action: "pause", result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeLogSync(
      input.db,
      input.connectionId,
      "upstream_monitor_exclude_group_rate_sources",
      `account:${input.accountId}`,
      { accountId: input.accountId },
      "failed",
      message,
    );
    return {
      affectedGroupIds: [],
      changedSources: [],
      sourceSiteIds: [],
      count: 0,
      exclusions: [],
    };
  }
}

export async function restoreMonitorRateSources(input: {
  db: MonitorDb;
  connectionId: number;
  accountId: number;
  restoredAt?: Date;
}) {
  try {
    const result = await restoreAccountMonitorRateSources(input);
    await applyMonitorRateExclusionChanges({ ...input, action: "restore", result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeLogSync(
      input.db,
      input.connectionId,
      "upstream_monitor_restore_group_rate_sources",
      `account:${input.accountId}`,
      { accountId: input.accountId },
      "failed",
      message,
    );
    return {
      affectedGroupIds: [],
      changedSources: [],
      sourceSiteIds: [],
      count: 0,
      exclusions: [],
    };
  }
}

async function pruneOldResults(db: MonitorDb, ruleId: number) {
  const stale = await db.upstreamMonitorResult.findMany({
    where: { ruleId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    skip: monitorResultKeepCount,
  });
  if (stale.length > 0) {
    await db.upstreamMonitorResult.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
}

async function createResult(input: {
  db: MonitorDb;
  rule: UpstreamMonitorRule;
  status: string;
  message?: string | null;
  latencyMs?: number | null;
  model?: string | null;
  startedAt: Date;
  finishedAt: Date;
}) {
  await input.db.upstreamMonitorResult.create({
    data: {
      ruleId: input.rule.id,
      connectionId: input.rule.connectionId,
      accountId: input.rule.accountId,
      status: input.status,
      message: input.message ? truncate(input.message) : null,
      latencyMs: input.latencyMs === undefined ? null : input.latencyMs,
      model: input.model || null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    },
  });
  await pruneOldResults(input.db, input.rule.id);
}

export async function executeUpstreamMonitorRule(options: ExecuteMonitorOptions) {
  const now = options.now ?? new Date();
  const client = options.client ?? await getClient(options.db, options.rule.connectionId);
  const wasPaused = Boolean(options.rule.pausedUntil);
  const startedAt = new Date();
  let success = false;
  let message = "";
  let latencyMs: number | null = null;
  let model: string | null = null;

  try {
    const result = await client.testAccount(options.rule.accountId, {
      model_id: options.rule.modelId ?? undefined,
      prompt: options.rule.prompt ?? undefined,
      timeoutMs: options.timeoutMs,
    });
    success = result.success;
    message = result.message;
    latencyMs = Number.isFinite(result.latency_ms) ? Math.round(result.latency_ms) : null;
    model = result.model ?? options.rule.modelId ?? null;
  } catch (error) {
    success = false;
    message = error instanceof Error ? error.message : String(error);
  }

  const finishedAt = new Date();
  const status = success ? "success" : "failed";
  let consecutiveFailures = success ? 0 : options.rule.consecutiveFailures + 1;
  let pausedUntil: Date | null | undefined = undefined;
  let pauseStartedAt: Date | null | undefined = undefined;
  const nextCheckAt = addMinutes(now, options.rule.checkIntervalMinutes);
  let pauseApplied = false;
  let resumeApplied = false;

  if (success && wasPaused) {
    try {
      await client.setSchedulable(options.rule.accountId, true);
      await restoreMonitorRateSources({
        db: options.db,
        connectionId: options.rule.connectionId,
        accountId: options.rule.accountId,
        restoredAt: now,
      });
      pausedUntil = null;
      pauseStartedAt = null;
      resumeApplied = true;
      message = `${message}；检测已恢复正常，已恢复账号调度`;
      await safeLogSync(
        options.db,
        options.rule.connectionId,
        "upstream_monitor_resume_account",
        `account:${options.rule.accountId}`,
        {
          accountId: options.rule.accountId,
          accountName: accountLabel(options.account, options.rule.accountId),
          reason: "monitor_recovered",
        },
        "success",
      );
    } catch (error) {
      const resumeError = error instanceof Error ? error.message : String(error);
      message = `${message}；检测已恢复正常，但恢复账号调度失败：${resumeError}`;
      await safeLogSync(
        options.db,
        options.rule.connectionId,
        "upstream_monitor_resume_account",
        `account:${options.rule.accountId}`,
        {
          accountId: options.rule.accountId,
          accountName: accountLabel(options.account, options.rule.accountId),
          reason: "monitor_recovered",
        },
        "failed",
        resumeError,
      );
    }
  }

  if (!success && consecutiveFailures >= options.rule.failureThreshold) {
    const account = options.account;
    if (wasPaused) {
      message = `${message}；账号暂停调度中，继续按检测间隔监测`;
    } else if (account?.schedulable === false) {
      message = `${message}；已达到连续失败阈值，但账号当前未参与调度，未设置自动恢复`;
    } else {
      const targetPausedUntil = addMinutes(now, options.rule.pauseMinutes);
      try {
        await client.setSchedulable(options.rule.accountId, false);
        pausedUntil = targetPausedUntil;
        pauseStartedAt = now;
        consecutiveFailures = 0;
        pauseApplied = true;
        const rateExclusions = await pauseMonitorRateSources({
          db: options.db,
          connectionId: options.rule.connectionId,
          accountId: options.rule.accountId,
          accountName: accountLabel(account, options.rule.accountId),
          reason: "upstream_monitor_pause",
          pausedAt: now,
        });
        message = `${message}；已连续失败 ${options.rule.failureThreshold} 次，已暂停调度至 ${targetPausedUntil.toLocaleString()}，期间继续按检测间隔监测`;
        await safeLogSync(
          options.db,
          options.rule.connectionId,
          "upstream_monitor_pause_account",
          `account:${options.rule.accountId}`,
          {
            accountId: options.rule.accountId,
            accountName: accountLabel(account, options.rule.accountId),
            failureThreshold: options.rule.failureThreshold,
            pauseMinutes: options.rule.pauseMinutes,
            pausedUntil: targetPausedUntil,
            excludedGroupRateSources: rateExclusions.count,
            affectedGroupIds: rateExclusions.affectedGroupIds,
            reason: message,
          },
          "success",
        );
      } catch (error) {
        const pauseError = error instanceof Error ? error.message : String(error);
        message = `${message}；已达到连续失败阈值，但暂停调度失败：${pauseError}`;
        await safeLogSync(
          options.db,
          options.rule.connectionId,
          "upstream_monitor_pause_account",
          `account:${options.rule.accountId}`,
          {
            accountId: options.rule.accountId,
            accountName: accountLabel(account, options.rule.accountId),
            failureThreshold: options.rule.failureThreshold,
            pauseMinutes: options.rule.pauseMinutes,
          },
          "failed",
          pauseError,
        );
      }
    }
  }

  await createResult({
    db: options.db,
    rule: options.rule,
    status,
    message,
    latencyMs,
    model,
    startedAt,
    finishedAt,
  });

  const updated = await options.db.upstreamMonitorRule.update({
    where: { id: options.rule.id },
    data: {
      accountName: options.account ? accountLabel(options.account, options.rule.accountId) : options.rule.accountName,
      consecutiveFailures,
      totalChecks: { increment: 1 },
      successChecks: success ? { increment: 1 } : undefined,
      lastStatus: status,
      lastMessage: truncate(message),
      lastLatencyMs: latencyMs,
      lastCheckedAt: finishedAt,
      nextCheckAt,
      pausedUntil,
      pauseStartedAt,
    },
  });

  await safeLogSync(
    options.db,
    options.rule.connectionId,
    "upstream_monitor_check",
    `account:${options.rule.accountId}`,
    {
      accountId: options.rule.accountId,
      accountName: accountLabel(options.account, options.rule.accountId),
      status,
      latencyMs,
      model,
      consecutiveFailures,
      pauseApplied,
      resumeApplied,
      reason: options.reason ?? "scheduled",
    },
    success ? "success" : "failed",
    success ? undefined : message,
  );

  return { rule: updated, success, status, message, latencyMs, model, pauseApplied, resumeApplied };
}

export async function resumeExpiredMonitorPauses(db: MonitorDb, now = new Date()) {
  const rules = await db.upstreamMonitorRule.findMany({
    where: {
      pausedUntil: { lte: now },
      connection: { enabled: true },
    },
    orderBy: [{ connectionId: "asc" }, { pausedUntil: "asc" }],
  });

  const clients = new Map<number, Sub2ApiAdminClient>();
  for (const rule of rules) {
    const startedAt = new Date();
    try {
      let client = clients.get(rule.connectionId);
      if (!client) {
        client = await getClient(db, rule.connectionId);
        clients.set(rule.connectionId, client);
      }
      await client.setSchedulable(rule.accountId, true);
      await restoreMonitorRateSources({
        db,
        connectionId: rule.connectionId,
        accountId: rule.accountId,
        restoredAt: now,
      });
      const finishedAt = new Date();
      await createResult({
        db,
        rule,
        status: "resumed",
        message: "暂停时间已到，已恢复账号调度",
        startedAt,
        finishedAt,
      });
      await db.upstreamMonitorRule.update({
        where: { id: rule.id },
        data: {
          pausedUntil: null,
          pauseStartedAt: null,
          consecutiveFailures: 0,
          nextCheckAt: addMinutes(now, rule.checkIntervalMinutes),
          lastStatus: "resumed",
          lastMessage: "暂停时间已到，已恢复账号调度",
        },
      });
      await safeLogSync(db, rule.connectionId, "upstream_monitor_resume_account", `account:${rule.accountId}`, { accountId: rule.accountId }, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date();
      await createResult({ db, rule, status: "resume_failed", message, startedAt, finishedAt });
      await db.upstreamMonitorRule.update({
        where: { id: rule.id },
        data: {
          pausedUntil: addMinutes(now, 1),
          nextCheckAt: addMinutes(now, rule.checkIntervalMinutes),
          lastStatus: "resume_failed",
          lastMessage: truncate(message),
        },
      });
      await safeLogSync(db, rule.connectionId, "upstream_monitor_resume_account", `account:${rule.accountId}`, { accountId: rule.accountId }, "failed", message);
    }
  }

  return rules.length;
}

export async function reschedulePausedMonitorChecks(db: MonitorDb, now = new Date()) {
  const rules = await db.upstreamMonitorRule.findMany({
    where: {
      enabled: true,
      pausedUntil: { gt: now },
      connection: { enabled: true },
    },
    orderBy: [{ connectionId: "asc" }, { nextCheckAt: "asc" }],
  });

  let rescheduled = 0;
  for (const rule of rules) {
    const lastCheckBasis = rule.lastCheckedAt ?? rule.pauseStartedAt ?? rule.updatedAt;
    const shouldHaveCheckedAt = addMinutes(lastCheckBasis, rule.checkIntervalMinutes);
    if (shouldHaveCheckedAt > now) continue;
    if (rule.nextCheckAt && rule.nextCheckAt <= now) continue;
    await db.upstreamMonitorRule.update({
      where: { id: rule.id },
      data: { nextCheckAt: now },
    });
    rescheduled += 1;
  }

  return rescheduled;
}

export async function runDueUpstreamMonitors(db: MonitorDb, now = new Date(), options: RunDueMonitorOptions = {}) {
  await resumeExpiredMonitorPauses(db, now);
  await reschedulePausedMonitorChecks(db, now);

  const rules = await db.upstreamMonitorRule.findMany({
    where: {
      enabled: true,
      connection: { enabled: true },
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
    },
    orderBy: [{ connectionId: "asc" }, { nextCheckAt: "asc" }],
  });
  if (rules.length === 0) return 0;

  const rulesByConnection = new Map<number, UpstreamMonitorRule[]>();
  for (const rule of rules) {
    const current = rulesByConnection.get(rule.connectionId) ?? [];
    current.push(rule);
    rulesByConnection.set(rule.connectionId, current);
  }

  let checked = 0;
  for (const [connectionId, connectionRules] of rulesByConnection) {
    let client: Sub2ApiAdminClient;
    try {
      client = await getClient(db, connectionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await safeLogSync(
        db,
        connectionId,
        "upstream_monitor_connection",
        `connection:${connectionId}`,
        { ruleCount: connectionRules.length },
        "failed",
        message,
      );
      continue;
    }

    let accounts: unknown[] = [];
    try {
      const payload = await client.listAccounts();
      accounts = Array.isArray(payload) ? payload : [];
    } catch {
      accounts = [];
    }

    await runWithConcurrency(connectionRules, options.concurrency ?? 3, async (rule) => {
      const account = findAccount(accounts, rule.accountId);
      try {
        await executeUpstreamMonitorRule({ db, rule, client, account, now, reason: "scheduled", timeoutMs: options.timeoutMs });
        checked += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(
          db,
          rule.connectionId,
          "upstream_monitor_check",
          `account:${rule.accountId}`,
          { accountId: rule.accountId, reason: "scheduled" },
          "failed",
          message,
        );
      } finally {
        await options.onProgress?.();
      }
    });
  }

  return checked;
}
