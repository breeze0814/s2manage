import type { Prisma, PrismaClient } from "@prisma/client";
import { getAccountId } from "@/server/account-utils";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { decrypt } from "@/server/crypto";
import { writeSyncLog } from "@/server/sync-logs";

type CleanupConnection = {
  id: number;
  name: string;
  baseUrl: string;
  adminApiKey: string;
  syncMode: string;
};

type SourceSnapshotRow = {
  siteId: number;
  siteName: string;
  groupId: string;
  groupName: string;
  platform: string | null;
};
type CleanupTx = Prisma.TransactionClient;

export type InvalidDataCleanupTotals = {
  deletedGroupBindings: number;
  deletedGroupRules: number;
  removedAnnouncementTargetIds: number;
  updatedAnnouncementRules: number;
  disabledAnnouncementRules: number;
  deletedAccountBindings: number;
  deletedAccountRules: number;
  deletedUpstreamMonitorRules: number;
  disabledGroupRules: number;
  disabledAccountRules: number;
  disabledUpstreamMonitorRules: number;
  disabledAutoSyncConnections: number;
  deletedMissingSourceBindings: number;
  updatedSourceBindingNames: number;
  disabledRulesWithoutSources: number;
};

export type InvalidDataCleanupConnectionResult = InvalidDataCleanupTotals & {
  connectionId: number;
  connectionName: string;
  status: "clean" | "cleaned" | "connection_unavailable";
  ok: boolean;
  message: string;
  groupsChecked: boolean;
  accountsChecked: boolean;
  sourcesChecked: boolean;
  remoteGroupCount: number | null;
  remoteAccountCount: number | null;
  sourceGroupCount: number;
  groupError: string | null;
  accountError: string | null;
  sourceError: string | null;
  staleGroupIds: number[];
  staleAccountIds: number[];
  missingSourceBindings: Array<{
    targetType: string;
    targetId: number;
    sourceSiteId: number;
    sourceGroupId: string;
    sourceGroupName: string | null;
  }>;
  renamedSourceBindings: Array<{
    targetType: string;
    targetId: number;
    sourceSiteId: number;
    sourceGroupId: string;
    oldName: string | null;
    newName: string;
  }>;
};

export type InvalidDataCleanupResult = {
  ok: boolean;
  checkedConnections: number;
  cleanedConnections: number;
  unavailableConnections: number;
  totals: InvalidDataCleanupTotals;
  connections: InvalidDataCleanupConnectionResult[];
};

const emptyTotals = (): InvalidDataCleanupTotals => ({
  deletedGroupBindings: 0,
  deletedGroupRules: 0,
  removedAnnouncementTargetIds: 0,
  updatedAnnouncementRules: 0,
  disabledAnnouncementRules: 0,
  deletedAccountBindings: 0,
  deletedAccountRules: 0,
  deletedUpstreamMonitorRules: 0,
  disabledGroupRules: 0,
  disabledAccountRules: 0,
  disabledUpstreamMonitorRules: 0,
  disabledAutoSyncConnections: 0,
  deletedMissingSourceBindings: 0,
  updatedSourceBindingNames: 0,
  disabledRulesWithoutSources: 0,
});

function addTotals(target: InvalidDataCleanupTotals, source: InvalidDataCleanupTotals) {
  for (const key of Object.keys(target) as Array<keyof InvalidDataCleanupTotals>) {
    target[key] += source[key];
  }
}

function toPositiveInt(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function uniqueSortedIds(ids: Iterable<unknown>) {
  const result = new Set<number>();
  for (const id of ids) {
    const numeric = toPositiveInt(id);
    if (numeric) result.add(numeric);
  }
  return Array.from(result).sort((left, right) => left - right);
}

function sourceKey(siteId: number, groupId: string) {
  return `${siteId}:${groupId}`;
}

function nameChanged(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").trim() !== (right ?? "").trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hasAnyCleanup(result: InvalidDataCleanupTotals) {
  return Object.values(result).some((value) => value > 0);
}

async function safeLogCleanup(db: PrismaClient, result: InvalidDataCleanupConnectionResult) {
  try {
    await writeSyncLog(db, {
      connectionId: result.connectionId,
      action: "cleanup_invalid_data",
      target: `connection:${result.connectionId}`,
      detail: {
        ...result,
        ok: undefined,
        status: undefined,
        message: undefined,
      },
      status: "success",
      error: result.status === "connection_unavailable" ? result.message : undefined,
    });
  } catch {
    // Cleanup should not fail because local maintenance logging failed.
  }
}

async function fetchRemoteState(connection: CleanupConnection) {
  let client: Sub2ApiAdminClient;
  try {
    client = new Sub2ApiAdminClient(connection.baseUrl, decrypt(connection.adminApiKey));
  } catch (error) {
    const message = errorMessage(error);
    return {
      groups: null,
      accounts: null,
      groupError: message,
      accountError: message,
    };
  }

  let groups: Awaited<ReturnType<Sub2ApiAdminClient["listGroups"]>> | null = null;
  let accounts: unknown[] | null = null;
  let groupError: string | null = null;
  let accountError: string | null = null;

  try {
    groups = await client.listGroups();
  } catch (error) {
    groupError = errorMessage(error);
  }

  try {
    accounts = await client.listAccounts();
  } catch (error) {
    accountError = errorMessage(error);
  }

  return { groups, accounts, groupError, accountError };
}

async function sourceSnapshot(input: {
  db: PrismaClient;
  connectionId: number;
}): Promise<{ rows: SourceSnapshotRow[]; checkedSiteIds: number[]; error: string | null }> {
  try {
    const sites = await input.db.blCollectionSite.findMany({
      where: { connectionId: input.connectionId },
      select: { id: true, name: true, lastStatus: true },
      orderBy: { id: "asc" },
    });
    const rows: SourceSnapshotRow[] = [];
    const checkedSiteIds: number[] = [];
    for (const site of sites) {
      if (site.lastStatus !== "online") continue;
      const latestRun = await input.db.blCollectionRun.findFirst({
        where: { connectionId: input.connectionId, siteId: site.id, status: "success" },
        select: { id: true },
        orderBy: { id: "desc" },
      });
      if (!latestRun) continue;
      checkedSiteIds.push(site.id);
      const groups = await input.db.blCollectedGroupRate.findMany({
        where: { connectionId: input.connectionId, siteId: site.id, runId: latestRun.id },
        select: { groupId: true, name: true, platform: true },
      });
      rows.push(...groups.map((group) => ({
        siteId: site.id,
        siteName: site.name,
        groupId: group.groupId,
        groupName: group.name,
        platform: group.platform,
      })));
    }
    return { rows, checkedSiteIds, error: null };
  } catch (error) {
    return { rows: [], checkedSiteIds: [], error: errorMessage(error) };
  }
}

async function disableRulesWithoutSources(input: {
  tx: CleanupTx;
  connectionId: number;
}) {
  const [groupTargetRows, accountTargetRows] = await Promise.all([
    input.tx.blSourceBinding.findMany({
      where: { connectionId: input.connectionId, targetType: "group" },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
    input.tx.blSourceBinding.findMany({
      where: { connectionId: input.connectionId, targetType: "account" },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
  ]);
  const groupTargetIds = groupTargetRows.map((row) => row.targetId);
  const accountTargetIds = accountTargetRows.map((row) => row.targetId);
  let disabled = 0;

  disabled += (await input.tx.blGroupRateRule.updateMany({
    where: {
      connectionId: input.connectionId,
      enabled: true,
      ...(groupTargetIds.length > 0 ? { groupId: { notIn: groupTargetIds } } : {}),
    },
    data: { enabled: false },
  })).count;

  disabled += (await input.tx.blAccountRateRule.updateMany({
    where: {
      connectionId: input.connectionId,
      enabled: true,
      ...(accountTargetIds.length > 0 ? { accountId: { notIn: accountTargetIds } } : {}),
    },
    data: { enabled: false },
  })).count;

  return disabled;
}

async function cleanupConnection(db: PrismaClient, connection: CleanupConnection): Promise<InvalidDataCleanupConnectionResult> {
  const [remote, sources] = await Promise.all([
    fetchRemoteState(connection),
    sourceSnapshot({ db, connectionId: connection.id }),
  ]);
  const totals = emptyTotals();
  const staleGroupIds: number[] = [];
  const staleAccountIds: number[] = [];
  const missingSourceBindings: InvalidDataCleanupConnectionResult["missingSourceBindings"] = [];
  const renamedSourceBindings: InvalidDataCleanupConnectionResult["renamedSourceBindings"] = [];

  await db.$transaction(async (tx) => {
    if (remote.groups) {
      const remoteGroupIds = new Set(uniqueSortedIds(remote.groups.map((group) => group.id)));
      const [groupBindings, groupRules, announcementRules] = await Promise.all([
        tx.blSourceBinding.findMany({
          where: { connectionId: connection.id, targetType: "group" },
          select: { targetId: true },
        }),
        tx.blGroupRateRule.findMany({
          where: { connectionId: connection.id },
          select: { groupId: true },
        }),
        tx.announcementRule.findMany({
          where: { connectionId: connection.id },
          select: { id: true, enabled: true, targetGroupIds: true },
        }),
      ]);

      staleGroupIds.push(...uniqueSortedIds([
        ...groupBindings.map((binding) => binding.targetId),
        ...groupRules.map((rule) => rule.groupId),
      ].filter((id) => !remoteGroupIds.has(id))));

      if (staleGroupIds.length > 0) {
        totals.deletedGroupBindings = (await tx.blSourceBinding.deleteMany({
          where: { connectionId: connection.id, targetType: "group", targetId: { in: staleGroupIds } },
        })).count;
        totals.deletedGroupRules = (await tx.blGroupRateRule.deleteMany({
          where: { connectionId: connection.id, groupId: { in: staleGroupIds } },
        })).count;
      }

      for (const rule of announcementRules) {
        if (rule.targetGroupIds.length === 0) continue;
        const validTargetGroupIds = rule.targetGroupIds.filter((id) => remoteGroupIds.has(id));
        const removed = rule.targetGroupIds.length - validTargetGroupIds.length;
        if (removed === 0) continue;

        totals.removedAnnouncementTargetIds += removed;
        if (validTargetGroupIds.length === 0) {
          await tx.announcementRule.update({
            where: { id: rule.id },
            data: { enabled: false, targetGroupIds: [] },
          });
          totals.disabledAnnouncementRules += rule.enabled ? 1 : 0;
        } else {
          await tx.announcementRule.update({
            where: { id: rule.id },
            data: { targetGroupIds: validTargetGroupIds },
          });
          totals.updatedAnnouncementRules += 1;
        }
      }
    } else {
      totals.disabledGroupRules = (await tx.blGroupRateRule.updateMany({
        where: { connectionId: connection.id, enabled: true },
        data: { enabled: false },
      })).count;

      if (connection.syncMode === "auto") {
        await tx.connection.update({
          where: { id: connection.id },
          data: { syncMode: "manual" },
        });
        totals.disabledAutoSyncConnections = 1;
      }
    }

    if (remote.accounts) {
      const remoteAccountIds = new Set(uniqueSortedIds(remote.accounts.map(getAccountId)));
      const [accountBindings, accountRules, monitorRules] = await Promise.all([
        tx.blSourceBinding.findMany({
          where: { connectionId: connection.id, targetType: "account" },
          select: { targetId: true },
        }),
        tx.blAccountRateRule.findMany({
          where: { connectionId: connection.id },
          select: { accountId: true },
        }),
        tx.upstreamMonitorRule.findMany({
          where: { connectionId: connection.id },
          select: { accountId: true },
        }),
      ]);

      staleAccountIds.push(...uniqueSortedIds([
        ...accountBindings.map((binding) => binding.targetId),
        ...accountRules.map((rule) => rule.accountId),
        ...monitorRules.map((rule) => rule.accountId),
      ].filter((id) => !remoteAccountIds.has(id))));

      if (staleAccountIds.length > 0) {
        totals.deletedAccountBindings = (await tx.blSourceBinding.deleteMany({
          where: { connectionId: connection.id, targetType: "account", targetId: { in: staleAccountIds } },
        })).count;
        totals.deletedAccountRules = (await tx.blAccountRateRule.deleteMany({
          where: { connectionId: connection.id, accountId: { in: staleAccountIds } },
        })).count;
        totals.deletedUpstreamMonitorRules = (await tx.upstreamMonitorRule.deleteMany({
          where: { connectionId: connection.id, accountId: { in: staleAccountIds } },
        })).count;
      }
    } else {
      totals.disabledAccountRules = (await tx.blAccountRateRule.updateMany({
        where: { connectionId: connection.id, enabled: true },
        data: { enabled: false },
      })).count;
      totals.disabledUpstreamMonitorRules = (await tx.upstreamMonitorRule.updateMany({
        where: { connectionId: connection.id, enabled: true },
        data: { enabled: false, nextCheckAt: null },
      })).count;
    }

    if (!sources.error && sources.checkedSiteIds.length > 0) {
      const sourcesByKey = new Map(sources.rows.map((source) => [sourceKey(source.siteId, source.groupId), source]));
      const bindings = await tx.blSourceBinding.findMany({
        where: { connectionId: connection.id, sourceSiteId: { in: sources.checkedSiteIds } },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          sourceSiteId: true,
          sourceSiteName: true,
          sourceGroupId: true,
          sourceGroupName: true,
        },
      });
      const missingBindingIds: number[] = [];

      for (const binding of bindings) {
        const source = sourcesByKey.get(sourceKey(binding.sourceSiteId, binding.sourceGroupId));
        if (!source) {
          missingBindingIds.push(binding.id);
          missingSourceBindings.push({
            targetType: binding.targetType,
            targetId: binding.targetId,
            sourceSiteId: binding.sourceSiteId,
            sourceGroupId: binding.sourceGroupId,
            sourceGroupName: binding.sourceGroupName,
          });
          continue;
        }

        if (nameChanged(binding.sourceGroupName, source.groupName) || nameChanged(binding.sourceSiteName, source.siteName)) {
          await tx.blSourceBinding.update({
            where: { id: binding.id },
            data: {
              sourceSiteName: source.siteName,
              sourceGroupName: source.groupName,
              sourcePlatform: source.platform,
            },
          });
          totals.updatedSourceBindingNames += 1;
          renamedSourceBindings.push({
            targetType: binding.targetType,
            targetId: binding.targetId,
            sourceSiteId: binding.sourceSiteId,
            sourceGroupId: binding.sourceGroupId,
            oldName: binding.sourceGroupName,
            newName: source.groupName,
          });
        }
      }

      if (missingBindingIds.length > 0) {
        totals.deletedMissingSourceBindings = (await tx.blSourceBinding.deleteMany({
          where: { id: { in: missingBindingIds } },
        })).count;
      }
    }

    totals.disabledRulesWithoutSources = await disableRulesWithoutSources({ tx, connectionId: connection.id });
  });

  const groupsChecked = Boolean(remote.groups);
  const accountsChecked = Boolean(remote.accounts);
  const sourcesChecked = !sources.error;
  const unavailable = !groupsChecked || !accountsChecked || !sourcesChecked;
  const cleaned = hasAnyCleanup(totals);
  const status: InvalidDataCleanupConnectionResult["status"] = unavailable
    ? "connection_unavailable"
    : cleaned
      ? "cleaned"
      : "clean";
  const message = unavailable
    ? "连接或源站快照不可用，已保留无法验证的数据并禁用无法验证的自动规则"
    : cleaned
      ? "已清理不存在目标/来源对应的绑定和规则"
      : "未发现无效数据";

  return {
    ...totals,
    connectionId: connection.id,
    connectionName: connection.name,
    status,
    ok: true,
    message,
    groupsChecked,
    accountsChecked,
    sourcesChecked,
    remoteGroupCount: remote.groups?.length ?? null,
    remoteAccountCount: remote.accounts?.length ?? null,
    sourceGroupCount: sources.rows.length,
    groupError: remote.groupError,
    accountError: remote.accountError,
    sourceError: sources.error,
    staleGroupIds,
    staleAccountIds,
    missingSourceBindings,
    renamedSourceBindings,
  };
}

export async function cleanupInvalidData(input: {
  db: PrismaClient;
  connectionId?: number;
}): Promise<InvalidDataCleanupResult> {
  const connections = await input.db.connection.findMany({
    where: input.connectionId ? { id: input.connectionId } : undefined,
    orderBy: { id: "asc" },
  });
  if (input.connectionId && connections.length === 0) {
    throw new Error("连接不存在");
  }

  const totals = emptyTotals();
  const results: InvalidDataCleanupConnectionResult[] = [];

  for (const connection of connections) {
    const result = await cleanupConnection(input.db, connection);
    addTotals(totals, result);
    results.push(result);
    await safeLogCleanup(input.db, result);
  }

  return {
    ok: results.every((result) => result.ok),
    checkedConnections: results.length,
    cleanedConnections: results.filter((result) => hasAnyCleanup(result)).length,
    unavailableConnections: results.filter((result) => result.status === "connection_unavailable").length,
    totals,
    connections: results,
  };
}
