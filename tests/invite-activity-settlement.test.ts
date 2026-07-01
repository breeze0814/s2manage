import assert from "node:assert/strict";
import {
  inviteActivitySettlementKeys,
  runDueInviteActivitySettlements,
} from "../src/server/invite-activity-settlement";

type SettingRow = { key: string; value: string };

function createSettingDb(initialRows: SettingRow[] = []) {
  const rows = new Map(initialRows.map((row) => [row.key, row.value]));
  return {
    rows,
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
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
