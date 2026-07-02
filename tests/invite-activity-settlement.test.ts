import assert from "node:assert/strict";
import {
  inviteActivitySettlementKeys,
  retryInviteActivityRewardGrants,
  runDueInviteActivitySettlements,
} from "../src/server/invite-activity-settlement";

type SettingRow = { key: string; value: string };
type RewardGrantRow = {
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

function createSettingDb(initialRows: SettingRow[] = [], initialGrants: RewardGrantRow[] = []) {
  const rows = new Map(initialRows.map((row) => [row.key, row.value]));
  const rewardGrants = new Map(initialGrants.map((row) => [`${row.connectionId}:${row.periodStartDate}:${row.inviterId}`, row]));
  let nextRewardGrantId = initialGrants.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  function rewardGrantKey(input: { connectionId: number; periodStartDate: string; inviterId: number }) {
    return `${input.connectionId}:${input.periodStartDate}:${input.inviterId}`;
  }

  return {
    rows,
    rewardGrants,
    db: {
      setting: {
        async findMany() {
          return [...rows.entries()].map(([key, value]) => ({ key, value }));
        },
        async upsert(args: { where: { key: string }; create: SettingRow; update: { value: string } }) {
          rows.set(args.where.key, args.update.value);
          return { key: args.where.key, value: args.update.value };
        },
      },
      inviteActivityRewardGrant: {
        async findMany(args: { where: { connectionId: number; periodStartDate: string; status?: { in: string[] } }; orderBy?: unknown }) {
          return [...rewardGrants.values()].filter((row) => {
            if (row.connectionId !== args.where.connectionId) return false;
            if (row.periodStartDate !== args.where.periodStartDate) return false;
            if (args.where.status?.in && !args.where.status.in.includes(row.status)) return false;
            return true;
          });
        },
        async upsert(args: {
          where: { connectionId_periodStartDate_inviterId: { connectionId: number; periodStartDate: string; inviterId: number } };
          create: Omit<RewardGrantRow, "id">;
          update: Partial<Omit<RewardGrantRow, "id">>;
        }) {
          const key = rewardGrantKey(args.where.connectionId_periodStartDate_inviterId);
          const existing = rewardGrants.get(key);
          const next = existing
            ? { ...existing, ...args.update }
            : { id: nextRewardGrantId++, ...args.create };
          rewardGrants.set(key, next);
          return next;
        },
        async update(args: { where: { id: number }; data: Partial<Omit<RewardGrantRow, "id">> }) {
          const existing = [...rewardGrants.values()].find((row) => row.id === args.where.id);
          if (!existing) throw new Error(`missing reward grant ${args.where.id}`);
          const next = { ...existing, ...args.data };
          rewardGrants.set(rewardGrantKey(next), next);
          return next;
        },
      },
    },
  };
}

void (async () => {
  const firstRunDb = createSettingDb();
  const firstRun = await runDueInviteActivitySettlements({
    db: firstRunDb.db,
    connectionIds: [1],
    now: new Date("2026-06-29T12:00:00+08:00"),
    loadActivity: async () => {
      throw new Error("first run should initialize schedule without settlement");
    },
  });

  const keys = inviteActivitySettlementKeys(1);
  assert.equal(firstRun.initialized, 1);
  assert.equal(firstRun.settled, 0);
  assert.equal(firstRunDb.rows.get(keys.periodStartAt), "2026-06-29T00:00:00.000+08:00");
  assert.equal(firstRunDb.rows.get(keys.nextSettlementAt), "2026-07-02T00:00:00.000+08:00");

  const restartDb = createSettingDb([
    { key: keys.periodStartAt, value: "2026-06-29T00:00:00.000+08:00" },
    { key: keys.nextSettlementAt, value: "2026-07-02T00:00:00.000+08:00" },
  ]);
  const settledPeriods: string[] = [];
  const restartRun = await runDueInviteActivitySettlements({
    db: restartDb.db,
    connectionIds: [1],
    now: new Date("2026-07-02T01:00:00+08:00"),
    loadActivity: async ({ currentDate }) => {
      settledPeriods.push(currentDate.toISOString());
      return {
        ok: true,
        summary: {
          period: { startDate: "2026-06-29", endDate: "2026-07-02" },
          periodInviteeCount: 2,
          activeInviteeCount: 1,
          inactiveInviteeCount: 1,
          leaderboard: [{ inviterId: 21, total: 2, rewardAmount: 12 }],
        },
      };
    },
  });

  const settlementKey = keys.settlementRecord("2026-06-29");
  const settlement = JSON.parse(restartDb.rows.get(settlementKey) ?? "{}") as Record<string, unknown>;
  assert.equal(restartRun.initialized, 0);
  assert.equal(restartRun.settled, 1);
  assert.deepEqual(settledPeriods, ["2026-06-28T16:00:00.000Z"]);
  assert.equal(restartDb.rows.get(keys.periodStartAt), "2026-07-02T00:00:00.000+08:00");
  assert.equal(restartDb.rows.get(keys.nextSettlementAt), "2026-07-05T00:00:00.000+08:00");
  assert.equal(settlement.status, "settled");
  assert.equal(settlement.connectionId, 1);
  assert.equal((settlement.summary as { periodInviteeCount?: number }).periodInviteeCount, 2);

  const rewardDb = createSettingDb([
    { key: keys.periodStartAt, value: "2026-06-29T00:00:00.000+08:00" },
    { key: keys.nextSettlementAt, value: "2026-07-02T00:00:00.000+08:00" },
  ]);
  const issuedRewards: Array<{ inviterId: number; rewardAmount: number }> = [];
  const rewardRun = await runDueInviteActivitySettlements({
    db: rewardDb.db,
    connectionIds: [1],
    now: new Date("2026-07-02T01:00:00+08:00"),
    loadActivity: async () => ({
      ok: true,
      summary: {
        period: { startDate: "2026-06-29", endDate: "2026-07-02" },
        periodInviteeCount: 3,
        activeInviteeCount: 1,
        inactiveInviteeCount: 2,
        leaderboard: [
          { inviterId: 21, inviterEmail: "owner@example.com", inviterUsername: "Owner", activeInviteeCount: 1, inactiveInviteeCount: 1, total: 2, rewardAmount: 12 },
          { inviterId: 22, inviterEmail: "zero@example.com", inviterUsername: "Zero", activeInviteeCount: 0, inactiveInviteeCount: 1, total: 1, rewardAmount: 0 },
          { inviterId: 23, inviterEmail: "unconfigured@example.com", inviterUsername: "NoConfig", activeInviteeCount: 1, inactiveInviteeCount: 0, total: 1, rewardAmount: null },
        ],
      },
    }),
    issueReward: async ({ inviterId, rewardAmount }) => {
      issuedRewards.push({ inviterId, rewardAmount });
      return { id: 9001, code: "reward-code-21" };
    },
  });

  assert.equal(rewardRun.rewardGrants.issued, 1);
  assert.equal(rewardRun.rewardGrants.failed, 0);
  assert.deepEqual(issuedRewards, [{ inviterId: 21, rewardAmount: 12 }]);
  assert.equal(rewardDb.rewardGrants.size, 1);
  const issuedGrant = [...rewardDb.rewardGrants.values()][0];
  assert.equal(issuedGrant?.status, "issued");
  assert.equal(issuedGrant?.redeemCode, "reward-code-21");
  assert.equal(issuedGrant?.attemptCount, 1);

  const retryDb = createSettingDb([], [
    {
      id: 1,
      connectionId: 1,
      periodStartDate: "2026-06-29",
      periodEndDate: "2026-07-02",
      inviterId: 21,
      inviterEmail: "failed@example.com",
      inviterUsername: "Failed",
      activeInviteeCount: 1,
      inactiveInviteeCount: 0,
      totalInviteeCount: 1,
      rewardAmount: 10,
      status: "failed",
      redeemCodeId: null,
      redeemCode: null,
      error: "HTTP 500",
      attemptCount: 1,
      issuedAt: null,
      lastAttemptAt: new Date("2026-07-02T00:10:00+08:00"),
    },
    {
      id: 2,
      connectionId: 1,
      periodStartDate: "2026-06-29",
      periodEndDate: "2026-07-02",
      inviterId: 22,
      inviterEmail: "issued@example.com",
      inviterUsername: "Issued",
      activeInviteeCount: 0,
      inactiveInviteeCount: 1,
      totalInviteeCount: 1,
      rewardAmount: 2,
      status: "issued",
      redeemCodeId: 8001,
      redeemCode: "already-issued",
      error: null,
      attemptCount: 1,
      issuedAt: new Date("2026-07-02T00:05:00+08:00"),
      lastAttemptAt: new Date("2026-07-02T00:05:00+08:00"),
    },
  ]);
  const retriedRewards: number[] = [];
  const retryResult = await retryInviteActivityRewardGrants({
    db: retryDb.db,
    connectionId: 1,
    periodStartDate: "2026-06-29",
    issueReward: async ({ inviterId }) => {
      retriedRewards.push(inviterId);
      return { id: 9002, code: "retry-code-21" };
    },
  });

  assert.deepEqual(retriedRewards, [21]);
  assert.equal(retryResult.retried, 1);
  assert.equal(retryResult.issued, 1);
  assert.equal(retryResult.failed, 0);
  const retriedGrant = retryDb.rewardGrants.get("1:2026-06-29:21");
  assert.equal(retriedGrant?.status, "issued");
  assert.equal(retriedGrant?.redeemCode, "retry-code-21");
  assert.equal(retriedGrant?.attemptCount, 2);
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
