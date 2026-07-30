import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../../storage/sqlite-utils.ts";
import type { RewardCode } from "./reward-code-gateway.ts";
import { EmbedError, type LotteryPrize } from "./types.ts";

export type DrawAssignment = {
  readonly entryId: string;
  readonly prize: LotteryPrize;
};

export function startDraw(database: DatabaseSync, campaignId: string, timestamp: string) {
  const result = database.prepare(`UPDATE embed_lottery_campaigns
    SET status = 'drawing', last_error = NULL, updated_at = ?
    WHERE id = ? AND status IN ('scheduled', 'open')`).run(timestamp, campaignId);
  return result.changes === 1;
}

export function resumeDraw(database: DatabaseSync, campaignId: string, timestamp: string) {
  const result = database.prepare(`UPDATE embed_lottery_campaigns SET last_error = NULL, updated_at = ?
    WHERE id = ? AND status = 'drawing' AND last_error IS NOT NULL`).run(timestamp, campaignId);
  return result.changes === 1;
}

export function saveDrawPlan(database: DatabaseSync, draw: Readonly<{
  campaignId: string; winners: readonly DrawAssignment[]; timestamp: string;
}>) {
  transaction(database, () => {
    assertDrawing(database, draw.campaignId);
    if (plannedWinnerCount(database, draw.campaignId) > 0) return;
    const statement = database.prepare(`UPDATE embed_lottery_entries SET prize_id = ?, prize_name = ?,
      prize_type = ?, prize_value = ?, updated_at = ? WHERE id = ? AND campaign_id = ?
      AND status = 'entered' AND prize_id IS NULL`);
    for (const winner of draw.winners) updatePlannedWinner(statement, draw, winner);
  });
}

export function savePlannedReward(database: DatabaseSync, value: Readonly<{
  entryId: string; reward: RewardCode; timestamp: string;
}>) {
  const result = database.prepare(`UPDATE embed_lottery_entries SET redemption_code = ?, reward_code_id = ?,
    updated_at = ? WHERE id = ? AND status = 'entered' AND prize_id IS NOT NULL
    AND redemption_code IS NULL`).run(value.reward.code, value.reward.id, value.timestamp, value.entryId);
  if (result.changes !== 1) throw new EmbedError("中奖兑换码状态已变化", 409);
}

export function finishDraw(database: DatabaseSync, campaignId: string, timestamp: string) {
  transaction(database, () => {
    assertDrawing(database, campaignId);
    assertRewardsComplete(database, campaignId);
    database.prepare(`UPDATE embed_lottery_entries SET status = CASE WHEN prize_id IS NULL
      THEN 'not_won' ELSE 'won' END, updated_at = ? WHERE campaign_id = ? AND status = 'entered'`)
      .run(timestamp, campaignId);
    database.prepare(`UPDATE embed_lottery_campaigns SET status = 'drawn', drawn_at = ?,
      last_error = NULL, updated_at = ? WHERE id = ? AND status = 'drawing'`)
      .run(timestamp, timestamp, campaignId);
  });
}

export function recordDrawError(database: DatabaseSync, value: Readonly<{
  campaignId: string; error: string; timestamp: string;
}>) {
  database.prepare(`UPDATE embed_lottery_campaigns SET last_error = ?, updated_at = ?
    WHERE id = ? AND status = 'drawing'`).run(value.error, value.timestamp, value.campaignId);
}

function updatePlannedWinner(
  statement: ReturnType<DatabaseSync["prepare"]>,
  draw: Readonly<{ campaignId: string; timestamp: string }>,
  winner: DrawAssignment,
) {
  const result = statement.run(winner.prize.id, winner.prize.name, winner.prize.type,
    winner.prize.value, draw.timestamp, winner.entryId, draw.campaignId);
  if (result.changes !== 1) throw new EmbedError("开奖名单状态已变化", 409);
}

function plannedWinnerCount(database: DatabaseSync, campaignId: string) {
  const result = database.prepare(`SELECT COUNT(*) AS count FROM embed_lottery_entries
    WHERE campaign_id = ? AND prize_id IS NOT NULL`).get(campaignId) as { count: number };
  return Number(result.count);
}

function assertRewardsComplete(database: DatabaseSync, campaignId: string) {
  const result = database.prepare(`SELECT COUNT(*) AS count FROM embed_lottery_entries
    WHERE campaign_id = ? AND prize_id IS NOT NULL AND redemption_code IS NULL`)
    .get(campaignId) as { count: number };
  if (Number(result.count) > 0) throw new Error("开奖兑换码尚未生成完成");
}

function assertDrawing(database: DatabaseSync, campaignId: string) {
  const row = database.prepare("SELECT status FROM embed_lottery_campaigns WHERE id = ?")
    .get(campaignId) as { status: string } | undefined;
  if (row?.status !== "drawing") throw new EmbedError("活动不在开奖处理中", 409);
}
