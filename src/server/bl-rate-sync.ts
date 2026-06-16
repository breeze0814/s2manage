import type { Prisma, PrismaClient } from "@prisma/client";
import { BlPublicClient, resolveBlRateMultiplier } from "@/server/clients/bl-public";
import { Sub2ApiAdminClient, type Sub2ApiGroup } from "@/server/clients/sub2api-admin";
import { evaluateGroupRateRule } from "@/server/bl-bindings";
import { decrypt } from "@/server/crypto";
import { publishRateChangeAnnouncements } from "@/server/announcement-rules";
import { ratesEqual } from "@/server/rates";
import { writeSyncLog } from "@/server/sync-logs";

type RateRuleDb = Pick<Prisma.TransactionClient, "blSourceBinding" | "blGroupRateRule" | "blAccountRateRule" | "connection" | "announcementRule">;
type LockableRateSyncDb = RateRuleDb & Pick<PrismaClient, "$transaction">;

type LoggableDb = Pick<PrismaClient, "connection">;

export type BoundRateSyncSummary = {
  appliedGroupRules: number;
  appliedAccountRules: number;
  skippedGroupRules: number;
  skippedAccountRules: number;
  failedGroupRules: number;
  failedAccountRules: number;
};

function sourceKey(siteId: number, groupId: string) {
  return `${siteId}:${groupId}`;
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

function formatSourceLabel(sources: Array<{ sourceSiteName?: string | null; sourceGroupId: string; sourceGroupName?: string | null }>) {
  if (sources.length === 0) return null;
  return sources
    .map((source) => `${source.sourceSiteName || "BL"} / ${source.sourceGroupName || source.sourceGroupId}`)
    .join(", ");
}

async function logSync(db: LoggableDb, connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await writeSyncLog(db, { connectionId, action, target, detail, status, error });
  } catch {
    // Sync logging must not stop rule application.
  }
}

async function withConnectionLock<T>(db: LockableRateSyncDb, connectionId: number, task: (tx: RateRuleDb) => Promise<T>) {
  const lockKey = (BigInt(connectionId) << 32n) | 0x424c526en;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return task(tx);
  }, { maxWait: 30_000, timeout: 180_000 });
}

function sameRate(left: number, right: number) {
  return ratesEqual(left, right);
}

function emptySummary(): BoundRateSyncSummary {
  return {
    appliedGroupRules: 0,
    appliedAccountRules: 0,
    skippedGroupRules: 0,
    skippedAccountRules: 0,
    failedGroupRules: 0,
    failedAccountRules: 0,
  };
}

function sourceSiteSet(sourceSiteIds?: number[]) {
  const ids = (sourceSiteIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

async function groupRuleTargets(input: {
  db: RateRuleDb;
  connectionId: number;
  sourceSiteIds?: number[];
}) {
  const allBindings = await input.db.blSourceBinding.findMany({
    where: { connectionId: input.connectionId, targetType: "group" },
    orderBy: [{ targetId: "asc" }, { sourceSiteName: "asc" }, { sourceGroupName: "asc" }],
  });
  const sourceSites = sourceSiteSet(input.sourceSiteIds);
  const targetGroupIds = new Set<number>();
  for (const binding of allBindings) {
    if (!sourceSites || sourceSites.has(binding.sourceSiteId)) {
      targetGroupIds.add(binding.targetId);
    }
  }
  if (targetGroupIds.size === 0) return { allBindings, targetGroupIds, rules: [] };

  const rules = await input.db.blGroupRateRule.findMany({
    where: { connectionId: input.connectionId, groupId: { in: Array.from(targetGroupIds) }, enabled: true },
  });
  return { allBindings, targetGroupIds, rules };
}

async function unavailableGroupRuleSummary(input: {
  db: RateRuleDb;
  connectionId: number;
  message: string;
  sourceSiteIds?: number[];
}) {
  const { targetGroupIds, rules } = await groupRuleTargets(input);
  const summary = emptySummary();
  if (rules.length === 0) return { boundGroupIds: targetGroupIds, summary };

  await logSync(
    input.db,
    input.connectionId,
    "auto_bl_bound_group_rule",
    `connection:${input.connectionId}`,
    { enabledGroupRules: rules.length, sourceSiteIds: input.sourceSiteIds ?? null },
    "failed",
    input.message,
  );
  summary.failedGroupRules = rules.length;
  return { boundGroupIds: targetGroupIds, summary };
}

async function applyBoundGroupRules(input: {
  db: RateRuleDb;
  connectionId: number;
  connectionName?: string | null;
  blClient: BlPublicClient;
  s2Client: Sub2ApiAdminClient;
  groups: Sub2ApiGroup[];
  sourceSiteIds?: number[];
}): Promise<{ boundGroupIds: Set<number>; summary: BoundRateSyncSummary }> {
  const { allBindings, targetGroupIds: boundGroupIds, rules } = await groupRuleTargets(input);
  const enabledRuleGroupIds = new Set(rules.map((rule) => rule.groupId));
  if (enabledRuleGroupIds.size === 0) {
    return { boundGroupIds, summary: emptySummary() };
  }

  const rates = await input.blClient.fetchRates(undefined, { bypassCache: true });
  const rulesByGroup = new Map(rules.map((rule) => [rule.groupId, rule]));
  const groupsById = new Map(input.groups.map((group) => [group.id, group]));
  const ratesBySource = new Map(rates.map((rate) => [sourceKey(rate.site_id, rate.group_id), rate]));
  const bindingsByGroup = new Map<number, typeof allBindings>();
  for (const binding of allBindings) {
    const current = bindingsByGroup.get(binding.targetId) ?? [];
    current.push(binding);
    bindingsByGroup.set(binding.targetId, current);
  }

  const summary: BoundRateSyncSummary = emptySummary();

  for (const groupId of enabledRuleGroupIds) {
    const target = groupsById.get(groupId);
    const bindings = bindingsByGroup.get(groupId) ?? [];
    const rule = rulesByGroup.get(groupId);
    if (!target) {
      const message = "No target group found for bound BL rule";
      await logSync(input.db, input.connectionId, "auto_bl_bound_group_rule", `group:${groupId}`, { groupId }, "failed", message);
      summary.failedGroupRules += 1;
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
      const latestTarget = await input.s2Client.getGroup(target.id).catch(() => target);
      const latestRate = typeof latestTarget.rate_multiplier === "number" ? latestTarget.rate_multiplier : currentRate;
      const detail = {
        targetGroupId: target.id,
        targetGroupName: target.name,
        rule: { enabled: rule.enabled, mode: rule.mode, offset: rule.offset, expression: rule.expression },
        sources,
        currentRate: latestRate,
        rateMultiplier,
      };

      if (sameRate(latestRate, rateMultiplier)) {
        summary.skippedGroupRules += 1;
        continue;
      }

      await input.s2Client.updateGroupRateMultiplier(target.id, rateMultiplier);
      const firstSource = sources[0];
      await publishRateChangeAnnouncements({
        db: input.db,
        client: input.s2Client,
        context: {
          action: "auto_bl_bound_group_rule",
          connectionId: input.connectionId,
          connectionName: input.connectionName,
          groupId: target.id,
          groupName: target.name,
          oldRate: latestRate,
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
      await logSync(input.db, input.connectionId, "auto_bl_bound_group_rule", `group:${target.id}`, detail, "success");
      summary.appliedGroupRules += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logSync(input.db, input.connectionId, "auto_bl_bound_group_rule", `group:${target.id}`, {
        targetGroupId: target.id,
        targetGroupName: target.name,
        sources,
      }, "failed", message);
      summary.failedGroupRules += 1;
    }
  }

  return { boundGroupIds, summary };
}

async function accountRuleTargets(input: {
  db: RateRuleDb;
  connectionId: number;
  sourceSiteIds?: number[];
}) {
  const allBindings = await input.db.blSourceBinding.findMany({
    where: { connectionId: input.connectionId, targetType: "account" },
    orderBy: [{ targetId: "asc" }, { sourceSiteName: "asc" }, { sourceGroupName: "asc" }],
  });
  const sourceSites = sourceSiteSet(input.sourceSiteIds);
  const boundAccountIds = new Set<number>();
  for (const binding of allBindings) {
    if (!sourceSites || sourceSites.has(binding.sourceSiteId)) {
      boundAccountIds.add(binding.targetId);
    }
  }
  if (boundAccountIds.size === 0) return { allBindings, rules: [] };

  const rules = await input.db.blAccountRateRule.findMany({
    where: { connectionId: input.connectionId, accountId: { in: Array.from(boundAccountIds) }, enabled: true },
  });
  return { allBindings, rules };
}

async function unavailableAccountRuleSummary(input: {
  db: RateRuleDb;
  connectionId: number;
  message: string;
  sourceSiteIds?: number[];
}) {
  const { rules } = await accountRuleTargets(input);
  const summary = emptySummary();
  if (rules.length === 0) return summary;

  await logSync(
    input.db,
    input.connectionId,
    "auto_bl_bound_account_rule",
    `connection:${input.connectionId}`,
    { enabledAccountRules: rules.length, sourceSiteIds: input.sourceSiteIds ?? null },
    "failed",
    input.message,
  );
  summary.failedAccountRules = rules.length;
  return summary;
}

async function applyBoundAccountRules(input: {
  db: RateRuleDb;
  connectionId: number;
  blClient: BlPublicClient;
  s2Client: Sub2ApiAdminClient;
  accounts: unknown[];
  sourceSiteIds?: number[];
}): Promise<BoundRateSyncSummary> {
  const { allBindings, rules } = await accountRuleTargets(input);
  if (rules.length === 0) {
    return emptySummary();
  }

  const rates = await input.blClient.fetchRates(undefined, { bypassCache: true });
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

  const summary: BoundRateSyncSummary = emptySummary();

  for (const accountId of rulesByAccount.keys()) {
    const target = accountsById.get(accountId);
    const bindings = bindingsByAccount.get(accountId) ?? [];
    const rule = rulesByAccount.get(accountId);
    if (!target) {
      await logSync(input.db, input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, { accountId }, "failed", "No target account found for bound BL rule");
      summary.failedAccountRules += 1;
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
      const latestTarget = input.accounts
        .map((account) => ({ account, accountId: getAccountId(account) }))
        .find((row) => row.accountId === accountId)?.account ?? target;
      const latestRate = getAccountRate(latestTarget) ?? currentRate;
      const detail = {
        targetAccountId: accountId,
        targetAccountName: accountName,
        rule: { enabled: rule.enabled, mode: rule.mode, offset: rule.offset, expression: rule.expression },
        sources,
        currentRate: latestRate,
        rateMultiplier,
      };

      if (sameRate(latestRate, rateMultiplier)) {
        summary.skippedAccountRules += 1;
        continue;
      }

      await input.s2Client.updateAccount(accountId, { rate_multiplier: rateMultiplier });
      await logSync(input.db, input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, detail, "success");
      summary.appliedAccountRules += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logSync(input.db, input.connectionId, "auto_bl_bound_account_rule", `account:${accountId}`, {
        targetAccountId: accountId,
        targetAccountName: accountName,
        sources,
      }, "failed", message);
      summary.failedAccountRules += 1;
    }
  }

  return summary;
}

export async function applyBoundRateRules(input: {
  db: RateRuleDb;
  connectionId: number;
  connectionName?: string | null;
  blClient: BlPublicClient;
  s2Client: Sub2ApiAdminClient;
  groups: Sub2ApiGroup[];
  accounts?: unknown[];
  accountsError?: string | null;
  sourceSiteIds?: number[];
  groupsError?: string | null;
}) {
  const groupResult = input.groupsError
    ? await unavailableGroupRuleSummary({
        db: input.db,
        connectionId: input.connectionId,
        message: input.groupsError,
        sourceSiteIds: input.sourceSiteIds,
      })
    : await applyBoundGroupRules({
        db: input.db,
        connectionId: input.connectionId,
        connectionName: input.connectionName,
        blClient: input.blClient,
        s2Client: input.s2Client,
        groups: input.groups,
        sourceSiteIds: input.sourceSiteIds,
      });
  const accountSummary = input.accounts
    ? await applyBoundAccountRules({
        db: input.db,
        connectionId: input.connectionId,
        blClient: input.blClient,
        s2Client: input.s2Client,
        accounts: input.accounts,
        sourceSiteIds: input.sourceSiteIds,
      })
    : input.accountsError
      ? await unavailableAccountRuleSummary({
          db: input.db,
          connectionId: input.connectionId,
          message: input.accountsError,
          sourceSiteIds: input.sourceSiteIds,
        })
      : emptySummary();

  return {
    boundGroupIds: groupResult.boundGroupIds,
    summary: {
      appliedGroupRules: groupResult.summary.appliedGroupRules,
      appliedAccountRules: accountSummary.appliedAccountRules,
      skippedGroupRules: groupResult.summary.skippedGroupRules,
      skippedAccountRules: accountSummary.skippedAccountRules,
      failedGroupRules: groupResult.summary.failedGroupRules,
      failedAccountRules: accountSummary.failedAccountRules,
    },
  };
}

export async function applyBoundRateRulesForConnection(input: {
  db: LockableRateSyncDb;
  connectionId: number;
  sourceSiteIds?: number[];
}) {
  return withConnectionLock(input.db, input.connectionId, async (tx) => {
    const conn = await tx.connection.findUnique({ where: { id: input.connectionId } });
    if (!conn || !conn.enabled) {
      return {
        ok: false,
        skipped: true,
        message: conn ? "connection disabled" : "connection not found",
        boundGroupIds: new Set<number>(),
        summary: emptySummary(),
      };
    }

    const blClient = new BlPublicClient(conn.id);
    const s2Client = new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
    let groups: Sub2ApiGroup[] | undefined;
    let groupsError: string | null = null;
    try {
      groups = await s2Client.listGroups();
    } catch (error) {
      groupsError = error instanceof Error ? error.message : String(error);
    }
    let accounts: unknown[] | undefined;
    let accountsError: string | null = null;
    try {
      accounts = await s2Client.listAccounts();
    } catch (error) {
      accountsError = error instanceof Error ? error.message : String(error);
    }
    const result = await applyBoundRateRules({
      db: tx,
      connectionId: conn.id,
      connectionName: conn.name,
      blClient,
      s2Client,
      groups: groups ?? [],
      groupsError,
      accounts,
      accountsError,
      sourceSiteIds: input.sourceSiteIds,
    });

    return {
      ok: result.summary.failedGroupRules === 0 && result.summary.failedAccountRules === 0,
      skipped: false,
      message: "rate rules applied",
      ...result,
    };
  });
}
