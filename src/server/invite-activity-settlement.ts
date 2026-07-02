import { formatDateInShanghai, inviteActivityPeriodForDate } from "@/server/invite-activity-rewards";

type SettingRow = { key: string; value: string };
type RewardGrantStatus = "pending" | "issued" | "failed";

export type InviteActivityRewardGrantRow = {
  id: number;
  connectionId: number;
  periodStartDate: string;
  periodEndDate: string;
  inviterId: number;
  inviterEmail: string;
  inviterUsername: string | null;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  totalInviteeCount: number;
  rewardAmount: number;
  status: string;
  redeemCodeId: number | null;
  redeemCode: string | null;
  error: string | null;
  attemptCount: number;
  issuedAt: Date | null;
  lastAttemptAt: Date | null;
};

export type InviteActivityRewardGrantDb = {
  inviteActivityRewardGrant?: {
    findMany(args: any): Promise<InviteActivityRewardGrantRow[]>;
    upsert(args: any): Promise<InviteActivityRewardGrantRow>;
    update(args: any): Promise<InviteActivityRewardGrantRow>;
  };
};

type InviteActivitySettlementDb = InviteActivityRewardGrantDb & {
  setting: {
    findMany(): Promise<SettingRow[]>;
    upsert(args: { where: { key: string }; create: SettingRow; update: { value: string } }): Promise<SettingRow>;
  };
};

type LoadActivityResult = {
  ok: boolean;
  summary: {
    affiliateEnabled?: boolean;
    period: { startDate: string; endDate: string };
    periodInviteeCount: number;
    activeInviteeCount: number;
    inactiveInviteeCount: number;
    missingUserCount?: number;
    leaderboard: InviteActivityRewardEntry[];
  };
};

type LoadActivity = (input: { connectionId: number; currentDate: Date }) => Promise<LoadActivityResult>;
type IssueReward = (input: {
  connectionId: number;
  periodStartDate: string;
  periodEndDate: string;
  inviterId: number;
  inviterEmail: string;
  inviterUsername: string | null;
  rewardAmount: number;
}) => Promise<{ id: number | null; code: string }>;

type InviteActivityRewardEntry = {
  inviterId?: number;
  inviterEmail?: string;
  inviterUsername?: string | null;
  activeInviteeCount?: number;
  inactiveInviteeCount?: number;
  total?: number;
  rewardAmount?: number | null;
};

type RewardGrantStats = { issued: number; failed: number; skipped: number };

const PERIOD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function inviteActivitySettlementKeys(connectionId: number) {
  return {
    periodStartAt: `invite_activity_period_start_at:${connectionId}`,
    nextSettlementAt: `invite_activity_next_settlement_at:${connectionId}`,
    lastSettlementAt: `invite_activity_last_settlement_at:${connectionId}`,
    settlementRecord: (periodStartDate: string) => `invite_activity_settlement:${connectionId}:${periodStartDate}`,
  };
}

export async function runDueInviteActivitySettlements(input: {
  db: InviteActivitySettlementDb;
  connectionIds: number[];
  now: Date;
  loadActivity: LoadActivity;
  issueReward?: IssueReward;
}) {
  const settings = await input.db.setting.findMany();
  const settingMap = new Map(settings.map((row) => [row.key, row.value]));
  const totals = {
    initialized: 0,
    settled: 0,
    rewardGrants: emptyRewardGrantStats(),
    connections: [] as Array<{ connectionId: number; initialized: number; settled: number; rewardGrants: RewardGrantStats }>,
  };

  for (const connectionId of input.connectionIds) {
    const result = await runConnectionSettlement({
      db: input.db,
      settingMap,
      connectionId,
      now: input.now,
      loadActivity: input.loadActivity,
      issueReward: input.issueReward,
    });
    totals.initialized += result.initialized;
    totals.settled += result.settled;
    addRewardGrantStats(totals.rewardGrants, result.rewardGrants);
    totals.connections.push({ connectionId, ...result });
  }

  return totals;
}

async function runConnectionSettlement(input: {
  db: InviteActivitySettlementDb;
  settingMap: Map<string, string>;
  connectionId: number;
  now: Date;
  loadActivity: LoadActivity;
  issueReward?: IssueReward;
}) {
  const keys = inviteActivitySettlementKeys(input.connectionId);
  let periodStartAt = parseDate(input.settingMap.get(keys.periodStartAt));
  let nextSettlementAt = parseDate(input.settingMap.get(keys.nextSettlementAt));

  if (!periodStartAt || !nextSettlementAt) {
    const initial = inviteActivityPeriodForDate(input.now);
    await writeSchedule(input.db, keys, initial.startAt, initial.endAt);
    return { initialized: 1, settled: 0, rewardGrants: emptyRewardGrantStats() };
  }

  let settled = 0;
  const rewardGrants = emptyRewardGrantStats();
  while (nextSettlementAt.getTime() <= input.now.getTime()) {
    const result = await settlePeriod(input.db, keys, input.connectionId, periodStartAt, input.loadActivity, input.issueReward);
    addRewardGrantStats(rewardGrants, result.rewardGrants);
    periodStartAt = nextSettlementAt;
    nextSettlementAt = addPeriod(periodStartAt);
    await writeSchedule(input.db, keys, periodStartAt, nextSettlementAt);
    settled += 1;
  }
  return { initialized: 0, settled, rewardGrants };
}

async function settlePeriod(
  db: InviteActivitySettlementDb,
  keys: ReturnType<typeof inviteActivitySettlementKeys>,
  connectionId: number,
  periodStartAt: Date,
  loadActivity: LoadActivity,
  issueReward?: IssueReward,
) {
  const result = await loadActivity({ connectionId, currentDate: periodStartAt });
  if (!result.ok) throw new Error(`邀请活动结算失败：connection ${connectionId}`);
  const status = result.summary.affiliateEnabled === false ? "skipped_disabled" : "settled";
  const settledAt = new Date();
  const rewardGrants = status === "settled"
    ? await persistAndIssueRewardGrants(db, connectionId, result.summary, issueReward)
    : emptyRewardGrantStats();
  await upsertSetting(db, keys.settlementRecord(result.summary.period.startDate), JSON.stringify({
    status,
    connectionId,
    settledAt: settledAt.toISOString(),
    rewardGrants,
    summary: result.summary,
  }));
  await upsertSetting(db, keys.lastSettlementAt, settledAt.toISOString());
  return { rewardGrants };
}

export async function listInviteActivityRewardGrants(input: {
  db: InviteActivityRewardGrantDb;
  connectionId: number;
  periodStartDate: string;
}) {
  if (!input.db.inviteActivityRewardGrant) return [];
  return input.db.inviteActivityRewardGrant.findMany({
    where: { connectionId: input.connectionId, periodStartDate: input.periodStartDate },
    orderBy: { id: "asc" },
  });
}

export async function retryInviteActivityRewardGrants(input: {
  db: InviteActivityRewardGrantDb;
  connectionId: number;
  periodStartDate: string;
  issueReward: IssueReward;
}) {
  if (!input.db.inviteActivityRewardGrant) throw new Error("邀请活动奖励发放记录表不可用");
  const rows = await input.db.inviteActivityRewardGrant.findMany({
    where: {
      connectionId: input.connectionId,
      periodStartDate: input.periodStartDate,
      status: { in: ["pending", "failed"] },
    },
    orderBy: { id: "asc" },
  });
  const stats = emptyRewardGrantStats();
  for (const row of rows.filter((item) => item.rewardAmount > 0)) {
    const result = await issueRewardGrant(input.db, row, input.issueReward);
    addRewardGrantStats(stats, result);
  }
  return { retried: rows.length, ...stats };
}

async function persistAndIssueRewardGrants(
  db: InviteActivitySettlementDb,
  connectionId: number,
  summary: LoadActivityResult["summary"],
  issueReward?: IssueReward,
) {
  if (!issueReward || !db.inviteActivityRewardGrant) return emptyRewardGrantStats();
  const stats = emptyRewardGrantStats();
  for (const entry of summary.leaderboard) {
    const grant = normalizeRewardEntry(connectionId, summary.period, entry);
    if (!grant) {
      stats.skipped += 1;
      continue;
    }
    const row = await db.inviteActivityRewardGrant.upsert({
      where: {
        connectionId_periodStartDate_inviterId: {
          connectionId,
          periodStartDate: summary.period.startDate,
          inviterId: grant.inviterId,
        },
      },
      create: {
        ...grant,
        status: "pending",
        redeemCodeId: null,
        redeemCode: null,
        error: null,
        attemptCount: 0,
        issuedAt: null,
        lastAttemptAt: null,
      },
      update: {
        periodEndDate: grant.periodEndDate,
        inviterEmail: grant.inviterEmail,
        inviterUsername: grant.inviterUsername,
        activeInviteeCount: grant.activeInviteeCount,
        inactiveInviteeCount: grant.inactiveInviteeCount,
        totalInviteeCount: grant.totalInviteeCount,
        rewardAmount: grant.rewardAmount,
      },
    });
    if (row.status === "issued") {
      stats.skipped += 1;
      continue;
    }
    const result = await issueRewardGrant(db, row, issueReward);
    addRewardGrantStats(stats, result);
  }
  return stats;
}

function normalizeRewardEntry(
  connectionId: number,
  period: { startDate: string; endDate: string },
  entry: InviteActivityRewardEntry,
): Omit<InviteActivityRewardGrantRow, "id" | "status" | "redeemCodeId" | "redeemCode" | "error" | "attemptCount" | "issuedAt" | "lastAttemptAt"> | null {
  const inviterId = typeof entry.inviterId === "number" && Number.isInteger(entry.inviterId) ? entry.inviterId : null;
  if (inviterId === null || !entry.inviterEmail || typeof entry.rewardAmount !== "number" || entry.rewardAmount <= 0) return null;
  return {
    connectionId,
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    inviterId,
    inviterEmail: entry.inviterEmail,
    inviterUsername: entry.inviterUsername ?? null,
    activeInviteeCount: numberOrZero(entry.activeInviteeCount),
    inactiveInviteeCount: numberOrZero(entry.inactiveInviteeCount),
    totalInviteeCount: numberOrZero(entry.total),
    rewardAmount: entry.rewardAmount,
  };
}

async function issueRewardGrant(
  db: InviteActivityRewardGrantDb,
  row: InviteActivityRewardGrantRow,
  issueReward: IssueReward,
) {
  if (!db.inviteActivityRewardGrant) throw new Error("邀请活动奖励发放记录表不可用");
  const attemptedAt = new Date();
  try {
    const redeemCode = await issueReward({
      connectionId: row.connectionId,
      periodStartDate: row.periodStartDate,
      periodEndDate: row.periodEndDate,
      inviterId: row.inviterId,
      inviterEmail: row.inviterEmail,
      inviterUsername: row.inviterUsername,
      rewardAmount: row.rewardAmount,
    });
    await db.inviteActivityRewardGrant.update({
      where: { id: row.id },
      data: {
        status: "issued" satisfies RewardGrantStatus,
        redeemCodeId: redeemCode.id,
        redeemCode: redeemCode.code,
        error: null,
        attemptCount: row.attemptCount + 1,
        issuedAt: attemptedAt,
        lastAttemptAt: attemptedAt,
      },
    });
    return { issued: 1, failed: 0, skipped: 0 };
  } catch (error) {
    await db.inviteActivityRewardGrant.update({
      where: { id: row.id },
      data: {
        status: "failed" satisfies RewardGrantStatus,
        error: errorMessage(error),
        attemptCount: row.attemptCount + 1,
        lastAttemptAt: attemptedAt,
      },
    });
    return { issued: 0, failed: 1, skipped: 0 };
  }
}

async function writeSchedule(
  db: InviteActivitySettlementDb,
  keys: ReturnType<typeof inviteActivitySettlementKeys>,
  periodStartAt: Date,
  nextSettlementAt: Date,
) {
  await Promise.all([
    upsertSetting(db, keys.periodStartAt, formatShanghaiMidnight(periodStartAt)),
    upsertSetting(db, keys.nextSettlementAt, formatShanghaiMidnight(nextSettlementAt)),
  ]);
}

async function upsertSetting(db: InviteActivitySettlementDb, key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

function addPeriod(date: Date) {
  return new Date(date.getTime() + PERIOD_DAYS * DAY_MS);
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatShanghaiMidnight(date: Date) {
  return `${formatDateInShanghai(date)}T00:00:00.000+08:00`;
}

function emptyRewardGrantStats(): RewardGrantStats {
  return { issued: 0, failed: 0, skipped: 0 };
}

function addRewardGrantStats(target: RewardGrantStats, source: RewardGrantStats) {
  target.issued += source.issued;
  target.failed += source.failed;
  target.skipped += source.skipped;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
