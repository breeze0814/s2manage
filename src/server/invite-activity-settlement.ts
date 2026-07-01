import { formatDateInShanghai, inviteActivityPeriodForDate } from "@/server/invite-activity-rewards";

type SettingRow = { key: string; value: string };

type InviteActivitySettlementDb = {
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
    leaderboard: unknown[];
  };
};

type LoadActivity = (input: { connectionId: number; currentDate: Date }) => Promise<LoadActivityResult>;

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
}) {
  const settings = await input.db.setting.findMany();
  const settingMap = new Map(settings.map((row) => [row.key, row.value]));
  const totals = { initialized: 0, settled: 0, connections: [] as Array<{ connectionId: number; initialized: number; settled: number }> };

  for (const connectionId of input.connectionIds) {
    const result = await runConnectionSettlement({
      db: input.db,
      settingMap,
      connectionId,
      now: input.now,
      loadActivity: input.loadActivity,
    });
    totals.initialized += result.initialized;
    totals.settled += result.settled;
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
}) {
  const keys = inviteActivitySettlementKeys(input.connectionId);
  let periodStartAt = parseDate(input.settingMap.get(keys.periodStartAt));
  let nextSettlementAt = parseDate(input.settingMap.get(keys.nextSettlementAt));

  if (!periodStartAt || !nextSettlementAt) {
    const initial = inviteActivityPeriodForDate(input.now);
    await writeSchedule(input.db, keys, initial.startAt, initial.endAt);
    return { initialized: 1, settled: 0 };
  }

  let settled = 0;
  while (nextSettlementAt.getTime() <= input.now.getTime()) {
    await settlePeriod(input.db, keys, input.connectionId, periodStartAt, input.loadActivity);
    periodStartAt = nextSettlementAt;
    nextSettlementAt = addPeriod(periodStartAt);
    await writeSchedule(input.db, keys, periodStartAt, nextSettlementAt);
    settled += 1;
  }
  return { initialized: 0, settled };
}

async function settlePeriod(
  db: InviteActivitySettlementDb,
  keys: ReturnType<typeof inviteActivitySettlementKeys>,
  connectionId: number,
  periodStartAt: Date,
  loadActivity: LoadActivity,
) {
  const result = await loadActivity({ connectionId, currentDate: periodStartAt });
  if (!result.ok) throw new Error(`邀请活动结算失败：connection ${connectionId}`);
  const status = result.summary.affiliateEnabled === false ? "skipped_disabled" : "settled";
  const settledAt = new Date();
  await upsertSetting(db, keys.settlementRecord(result.summary.period.startDate), JSON.stringify({
    status,
    connectionId,
    settledAt: settledAt.toISOString(),
    summary: result.summary,
  }));
  await upsertSetting(db, keys.lastSettlementAt, settledAt.toISOString());
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
