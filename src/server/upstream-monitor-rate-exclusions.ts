import type { PrismaClient } from "@prisma/client";

type RateExclusionDb = Pick<PrismaClient, "blSourceBinding" | "upstreamMonitorRateExclusion">;

export type ChangedMonitorRateSource = {
  sourceSiteId: number;
  sourceGroupId: string;
};

export type MonitorRateExclusion = {
  accountId: number;
  accountName: string | null;
  groupId: number;
  sourceSiteId: number;
  sourceSiteName: string;
  sourceGroupId: string;
  sourceGroupName: string | null;
  sourcePlatform: string | null;
  reason: string | null;
  pausedAt: Date;
};

export type MonitorRateExclusionSyncResult = {
  affectedGroupIds: number[];
  changedSources: ChangedMonitorRateSource[];
  sourceSiteIds: number[];
  count: number;
  exclusions: MonitorRateExclusion[];
};

export function monitorRateSourceKey(sourceSiteId: number, sourceGroupId: string) {
  return `${sourceSiteId}:${sourceGroupId}`;
}

export function monitorGroupRateExclusionKey(groupId: number, sourceSiteId: number, sourceGroupId: string) {
  return `${groupId}:${monitorRateSourceKey(sourceSiteId, sourceGroupId)}`;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function uniqueChangedSources(values: ChangedMonitorRateSource[]) {
  return Array.from(
    new Map(values.map((source) => [monitorRateSourceKey(source.sourceSiteId, source.sourceGroupId), source])).values(),
  );
}

function resultFromExclusions(exclusions: MonitorRateExclusion[]): MonitorRateExclusionSyncResult {
  return {
    affectedGroupIds: uniqueNumbers(exclusions.map((row) => row.groupId)),
    changedSources: uniqueChangedSources(exclusions.map((row) => ({
      sourceSiteId: row.sourceSiteId,
      sourceGroupId: row.sourceGroupId,
    }))),
    sourceSiteIds: uniqueNumbers(exclusions.map((row) => row.sourceSiteId)),
    count: exclusions.length,
    exclusions,
  };
}

export async function readActiveMonitorRateExclusions(input: {
  db: RateExclusionDb;
  connectionId: number;
  groupIds?: number[];
}) {
  const groupIds = uniqueNumbers(input.groupIds ?? []);
  const rows = await input.db.upstreamMonitorRateExclusion.findMany({
    where: {
      connectionId: input.connectionId,
      active: true,
      ...(groupIds.length > 0 ? { groupId: { in: groupIds } } : {}),
    },
    orderBy: [{ groupId: "asc" }, { sourceSiteId: "asc" }, { sourceGroupId: "asc" }, { accountId: "asc" }],
  });

  return rows.map<MonitorRateExclusion>((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    groupId: row.groupId,
    sourceSiteId: row.sourceSiteId,
    sourceSiteName: row.sourceSiteName,
    sourceGroupId: row.sourceGroupId,
    sourceGroupName: row.sourceGroupName,
    sourcePlatform: row.sourcePlatform,
    reason: row.reason,
    pausedAt: row.pausedAt,
  }));
}

export function groupMonitorRateExclusionsBySource(exclusions: MonitorRateExclusion[]) {
  const map = new Map<string, MonitorRateExclusion[]>();
  for (const exclusion of exclusions) {
    const key = monitorGroupRateExclusionKey(exclusion.groupId, exclusion.sourceSiteId, exclusion.sourceGroupId);
    const current = map.get(key) ?? [];
    current.push(exclusion);
    map.set(key, current);
  }
  return map;
}

export async function pauseAccountMonitorRateSources(input: {
  db: RateExclusionDb;
  connectionId: number;
  accountId: number;
  accountName?: string | null;
  reason?: string | null;
  pausedAt?: Date;
}) {
  const accountBindings = await input.db.blSourceBinding.findMany({
    where: {
      connectionId: input.connectionId,
      targetType: "account",
      targetId: input.accountId,
    },
    orderBy: [{ sourceSiteId: "asc" }, { sourceGroupId: "asc" }],
  });
  if (accountBindings.length === 0) return resultFromExclusions([]);

  const accountSourceKeys = new Set(accountBindings.map((binding) => monitorRateSourceKey(binding.sourceSiteId, binding.sourceGroupId)));
  const sourceSiteIds = uniqueNumbers(accountBindings.map((binding) => binding.sourceSiteId));
  const groupBindings = await input.db.blSourceBinding.findMany({
    where: {
      connectionId: input.connectionId,
      targetType: "group",
      sourceSiteId: { in: sourceSiteIds },
    },
    orderBy: [{ targetId: "asc" }, { sourceSiteId: "asc" }, { sourceGroupId: "asc" }],
  });
  const matchedBindings = groupBindings.filter((binding) => accountSourceKeys.has(monitorRateSourceKey(binding.sourceSiteId, binding.sourceGroupId)));
  if (matchedBindings.length === 0) return resultFromExclusions([]);

  const pausedAt = input.pausedAt ?? new Date();
  const reason = input.reason ?? null;
  const accountName = input.accountName ?? null;

  await Promise.all(matchedBindings.map((binding) => (
    input.db.upstreamMonitorRateExclusion.upsert({
      where: {
        connectionId_accountId_groupId_sourceSiteId_sourceGroupId: {
          connectionId: input.connectionId,
          accountId: input.accountId,
          groupId: binding.targetId,
          sourceSiteId: binding.sourceSiteId,
          sourceGroupId: binding.sourceGroupId,
        },
      },
      create: {
        connectionId: input.connectionId,
        accountId: input.accountId,
        accountName,
        groupId: binding.targetId,
        sourceSiteId: binding.sourceSiteId,
        sourceSiteName: binding.sourceSiteName,
        sourceGroupId: binding.sourceGroupId,
        sourceGroupName: binding.sourceGroupName,
        sourcePlatform: binding.sourcePlatform,
        reason,
        active: true,
        pausedAt,
      },
      update: {
        accountName,
        sourceSiteName: binding.sourceSiteName,
        sourceGroupName: binding.sourceGroupName,
        sourcePlatform: binding.sourcePlatform,
        reason,
        active: true,
        pausedAt,
        restoredAt: null,
      },
    })
  )));

  const exclusions = matchedBindings.map<MonitorRateExclusion>((binding) => ({
    accountId: input.accountId,
    accountName,
    groupId: binding.targetId,
    sourceSiteId: binding.sourceSiteId,
    sourceSiteName: binding.sourceSiteName,
    sourceGroupId: binding.sourceGroupId,
    sourceGroupName: binding.sourceGroupName,
    sourcePlatform: binding.sourcePlatform,
    reason,
    pausedAt,
  }));

  return resultFromExclusions(exclusions);
}

export async function restoreAccountMonitorRateSources(input: {
  db: RateExclusionDb;
  connectionId: number;
  accountId: number;
  restoredAt?: Date;
}) {
  const rows = await input.db.upstreamMonitorRateExclusion.findMany({
    where: {
      connectionId: input.connectionId,
      accountId: input.accountId,
      active: true,
    },
    orderBy: [{ groupId: "asc" }, { sourceSiteId: "asc" }, { sourceGroupId: "asc" }],
  });
  if (rows.length === 0) return resultFromExclusions([]);

  const restoredAt = input.restoredAt ?? new Date();
  await input.db.upstreamMonitorRateExclusion.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: {
      active: false,
      restoredAt,
    },
  });

  return resultFromExclusions(rows.map<MonitorRateExclusion>((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    groupId: row.groupId,
    sourceSiteId: row.sourceSiteId,
    sourceSiteName: row.sourceSiteName,
    sourceGroupId: row.sourceGroupId,
    sourceGroupName: row.sourceGroupName,
    sourcePlatform: row.sourcePlatform,
    reason: row.reason,
    pausedAt: row.pausedAt,
  })));
}
