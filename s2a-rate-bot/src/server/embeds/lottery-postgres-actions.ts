import { EmbedError, type LotteryEntry } from "./types.ts";
import type { InstantSettlement, ScheduledDraw, Withdrawal } from "./lottery-store-contract.ts";
import { PRIZE_COLUMNS, readCampaignRow, readPrizeRows, requiredCampaign } from "./lottery-postgres-campaigns.ts";
import {
  type CampaignRow, type EntryRow, type LotteryExecutor, type LotteryPostgresContext, type PrizeRow,
  mapEntry, withTransaction,
} from "./lottery-postgres-types.ts";

const ENTRY_COLUMNS = `e.id,e.campaign_id,e.participation_key,e.sub2api_user_id,e.masked_email,e.status,
  e.prize_id,e.prize_name,e.prize_type,e.prize_value,e.redemption_code,e.reward_code_id,
  j.status AS reward_status,e.created_at,e.updated_at`;
const PROBABILITY_SCALE = 1_000_000;

export async function listPostgresEntries(context: LotteryPostgresContext, campaignId: string) {
  await context.ready;
  const result = await context.pool.query<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM lottery_entries e
    LEFT JOIN lottery_reward_jobs j ON j.entry_id=e.id WHERE e.campaign_id=$1 ORDER BY e.created_at,e.id`, [campaignId]);
  return result.rows.map(mapEntry);
}

export async function getPostgresEntry(
  context: LotteryPostgresContext,
  input: Readonly<{ campaignId: string; userId: string; participationKey: string }>,
) {
  await context.ready;
  return readEntry(context.pool, input);
}

export function enterPostgresScheduled(context: LotteryPostgresContext, entry: LotteryEntry) {
  return withTransaction(context, async (client) => {
    const campaign = await requiredEntryCampaign(client, {
      campaignId: entry.campaignId, drawMode: "scheduled",
    });
    const key = entryKey(entry);
    const current = await readEntry(client, key);
    if (current?.status === "entered") return current;
    assertCampaignOpen(campaign, entry.createdAt);
    if (current?.status !== "withdrawn" && current) throw new EmbedError("当前抽奖记录不能重新报名", 409);
    if (current) await reactivateEntry(client, entry);
    else await insertEntry(client, entry);
    return requiredEntry(client, key);
  });
}

export function settlePostgresInstant(context: LotteryPostgresContext, input: InstantSettlement) {
  return withTransaction(context, async (client) => {
    const campaign = await requiredEntryCampaign(client, {
      campaignId: input.entry.campaignId, drawMode: "instant",
    });
    const key = entryKey(input.entry);
    const current = await readEntry(client, key);
    if (current) return current;
    assertCampaignOpen(campaign, input.entry.createdAt);
    const prizes = await readPrizeRows(client, input.entry.campaignId);
    const selected = selectedPrize(prizes, input.roll);
    const reserved = selected ? await reservePrize(client, selected.id) : null;
    const settled = reserved ? winningEntry(input.entry, reserved) : losingEntry(input.entry);
    await insertEntry(client, settled);
    if (reserved) await insertRewardJob(client, input, reserved);
    if (reserved) await closeExhaustedCampaign(client, input.entry.campaignId, input.entry.updatedAt);
    return requiredEntry(client, key);
  });
}

export function withdrawPostgresEntry(context: LotteryPostgresContext, input: Withdrawal) {
  return withTransaction(context, async (client) => {
    const campaign = await requiredEntryCampaign(client, {
      campaignId: input.campaignId, drawMode: "scheduled",
    });
    assertCampaignOpen(campaign, input.timestamp);
    const result = await client.query(`UPDATE lottery_entries SET status='withdrawn',updated_at=$4
      WHERE campaign_id=$1 AND sub2api_user_id=$2 AND participation_key=$3 AND status='entered' RETURNING id`,
    [input.campaignId, input.userId, input.participationKey, input.timestamp]);
    if (!result.rowCount) return null;
    return requiredEntry(client, { campaignId: input.campaignId, userId: input.userId, participationKey: input.participationKey });
  });
}

export function drawPostgresScheduled(context: LotteryPostgresContext, input: ScheduledDraw) {
  return withTransaction(context, async (client) => {
    const campaign = await readCampaignRow(client, input.campaignId, true);
    if (!campaign) throw new EmbedError("抽奖活动不存在", 404);
    if (campaign.draw_mode !== "scheduled") throw new EmbedError("即时开奖不使用定时开奖操作", 409);
    if (campaign.status === "drawn") return requiredCampaign(client, campaign.id);
    assertDrawDue(campaign, input.timestamp);
    await client.query("UPDATE lottery_campaigns SET status='drawing',last_error=NULL,updated_at=$2 WHERE id=$1", [campaign.id, input.timestamp]);
    const entries = await readActiveEntries(client, campaign.id);
    const prizeRows = await readPrizeRows(client, campaign.id);
    const assignments = input.choose(entries, prizeRows.map(rowToPrize));
    await applyDrawPlan(client, { ...input, assignments, prizeRows });
    return requiredCampaign(client, campaign.id);
  });
}

export async function advancePostgresCampaigns(context: LotteryPostgresContext, timestamp: string) {
  await context.ready;
  await context.pool.query(`UPDATE lottery_campaigns SET status='open',updated_at=$1,last_error=NULL
    WHERE status='scheduled' AND (registration_start IS NULL OR registration_start <= $1)`, [timestamp]);
  await context.pool.query(`UPDATE lottery_campaigns SET status='closed',updated_at=$1
    WHERE status='open' AND draw_mode='scheduled' AND registration_end <= $1`, [timestamp]);
  await context.pool.query(`UPDATE lottery_campaigns SET status='drawn',drawn_at=$1,updated_at=$1
    WHERE status='open' AND draw_mode='instant' AND registration_end <= $1`, [timestamp]);
}

export async function listDuePostgresDraws(context: LotteryPostgresContext, timestamp: string) {
  await context.ready;
  const result = await context.pool.query<{ id: string }>(`SELECT id FROM lottery_campaigns
    WHERE status='closed' AND draw_mode='scheduled' AND draw_at <= $1 ORDER BY draw_at,id`, [timestamp]);
  return result.rows.map((row) => row.id);
}

export async function recordPostgresCampaignError(
  context: LotteryPostgresContext,
  input: Readonly<{ campaignId: string; message: string; timestamp: string }>,
) {
  await context.ready;
  await context.pool.query("UPDATE lottery_campaigns SET last_error=$2,updated_at=$3 WHERE id=$1",
    [input.campaignId, input.message, input.timestamp]);
}

async function requiredEntryCampaign(
  executor: LotteryExecutor,
  input: Readonly<{ campaignId: string; drawMode: CampaignRow["draw_mode"] }>,
) {
  const campaign = await readCampaignRow(executor, input.campaignId, true);
  if (!campaign) throw new EmbedError("抽奖活动不存在", 404);
  if (!campaign.visible_to_users) throw new EmbedError("抽奖活动不存在", 404);
  if (campaign.draw_mode !== input.drawMode) throw new EmbedError("活动当前不可参与", 409);
  return campaign;
}

function assertCampaignOpen(campaign: CampaignRow, timestamp: string) {
  if (campaign.status !== "open") throw new EmbedError("活动当前不可参与", 409);
  const now = Date.parse(timestamp);
  if ((campaign.registration_start && campaign.registration_start.getTime() > now)
    || (campaign.registration_end && campaign.registration_end.getTime() <= now)) {
    throw new EmbedError("当前不在活动时间内", 409);
  }
}

async function readEntry(executor: LotteryExecutor, input: EntryKey) {
  const result = await executor.query<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM lottery_entries e
    LEFT JOIN lottery_reward_jobs j ON j.entry_id=e.id
    WHERE e.campaign_id=$1 AND e.sub2api_user_id=$2 AND e.participation_key=$3`,
  [input.campaignId, input.userId, input.participationKey]);
  return result.rows[0] ? mapEntry(result.rows[0]) : null;
}

async function requiredEntry(executor: LotteryExecutor, input: EntryKey) {
  const entry = await readEntry(executor, input);
  if (!entry) throw new Error("抽奖记录不存在");
  return entry;
}

async function insertEntry(executor: LotteryExecutor, entry: LotteryEntry) {
  await executor.query(`INSERT INTO lottery_entries
    (id,campaign_id,participation_key,sub2api_user_id,masked_email,status,prize_id,prize_name,prize_type,
      prize_value,redemption_code,reward_code_id,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, entryValues(entry));
}

async function reactivateEntry(executor: LotteryExecutor, entry: LotteryEntry) {
  await executor.query(`UPDATE lottery_entries SET status='entered',masked_email=$4,prize_id=NULL,prize_name=NULL,
    prize_type=NULL,prize_value=NULL,redemption_code=NULL,reward_code_id=NULL,updated_at=$5
    WHERE campaign_id=$1 AND sub2api_user_id=$2 AND participation_key=$3 AND status='withdrawn'`,
  [entry.campaignId, entry.sub2apiUserId, entry.participationKey, entry.maskedEmail, entry.updatedAt]);
}

function selectedPrize(rows: readonly PrizeRow[], roll: number) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= PROBABILITY_SCALE) throw new Error("即时抽奖随机数无效");
  let boundary = 0;
  for (const row of rows) {
    if (row.probability_ppm === null) throw new Error(`奖品 ${row.name} 缺少即时中奖率`);
    boundary += row.probability_ppm;
    if (roll < boundary) return row;
  }
  return null;
}

async function reservePrize(executor: LotteryExecutor, prizeId: string) {
  const result = await executor.query<PrizeRow>(`UPDATE lottery_prizes SET remaining_quantity=remaining_quantity-1
    WHERE id=$1 AND remaining_quantity>0 RETURNING ${PRIZE_COLUMNS}`, [prizeId]);
  return result.rows[0] ?? null;
}

async function insertRewardJob(executor: LotteryExecutor, input: InstantSettlement, prize: PrizeRow) {
  await executor.query(`INSERT INTO lottery_reward_jobs
    (id,campaign_id,entry_id,prize_id,type,value,status,idempotency_key,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$8)`, [
    input.rewardJobId, input.entry.campaignId, input.entry.id, prize.id, prize.type,
    Number(prize.value), input.idempotencyKey, input.entry.updatedAt,
  ]);
}

async function closeExhaustedCampaign(executor: LotteryExecutor, campaignId: string, timestamp: string) {
  await executor.query(`UPDATE lottery_campaigns SET status='exhausted',drawn_at=$2,updated_at=$2
    WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM lottery_prizes WHERE campaign_id=$1 AND remaining_quantity>0)`,
  [campaignId, timestamp]);
}

function assertDrawDue(campaign: CampaignRow, timestamp: string) {
  const now = Date.parse(timestamp);
  if (!["open", "closed"].includes(campaign.status)) throw new EmbedError("活动当前不能开奖", 409);
  if (!campaign.draw_at || campaign.draw_at.getTime() > now) throw new EmbedError("尚未到定时开奖时间", 409);
  if (campaign.registration_end && campaign.registration_end.getTime() > now) throw new EmbedError("报名尚未结束", 409);
}

async function readActiveEntries(executor: LotteryExecutor, campaignId: string) {
  const result = await executor.query<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM lottery_entries e
    LEFT JOIN lottery_reward_jobs j ON j.entry_id=e.id
    WHERE e.campaign_id=$1 AND e.status='entered' ORDER BY e.created_at,e.id`, [campaignId]);
  return result.rows.map(mapEntry);
}

async function applyDrawPlan(executor: LotteryExecutor, input: DrawPlan) {
  await executor.query("UPDATE lottery_entries SET status='not_won',updated_at=$2 WHERE campaign_id=$1 AND status='entered'",
    [input.campaignId, input.timestamp]);
  const prizes = new Map(input.prizeRows.map((row) => [row.id, row]));
  for (const assignment of input.assignments) {
    const prize = prizes.get(assignment.prize.id);
    if (!prize) throw new Error("开奖计划包含未知奖品");
    await applyWinner(executor, { ...input, assignment, prize });
  }
  await executor.query(`UPDATE lottery_campaigns SET status='drawn',drawn_at=$2,last_error=NULL,updated_at=$2
    WHERE id=$1 AND status='drawing'`, [input.campaignId, input.timestamp]);
}

async function applyWinner(executor: LotteryExecutor, input: WinnerPlan) {
  const result = await executor.query(`UPDATE lottery_entries SET status='won',prize_id=$2,prize_name=$3,
    prize_type=$4,prize_value=$5,updated_at=$6 WHERE id=$1 AND status='not_won' RETURNING id`, [
    input.assignment.entryId, input.prize.id, input.prize.name, input.prize.type,
    Number(input.prize.value), input.timestamp,
  ]);
  if (!result.rowCount) throw new Error("开奖候选记录状态已变化");
  const jobId = input.jobId();
  const inventory = await executor.query(`UPDATE lottery_prizes SET remaining_quantity=remaining_quantity-1
    WHERE id=$1 AND remaining_quantity>0 RETURNING id`, [input.prize.id]);
  if (!inventory.rowCount) throw new Error(`奖品 ${input.prize.name} 库存不足`);
  await executor.query(`INSERT INTO lottery_reward_jobs
    (id,campaign_id,entry_id,prize_id,type,value,status,idempotency_key,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$8)`, [
    jobId, input.campaignId, input.assignment.entryId, input.prize.id, input.prize.type,
    Number(input.prize.value), `s2a-lottery-${jobId}`, input.timestamp,
  ]);
}

function rowToPrize(row: PrizeRow) {
  return { id: row.id, name: row.name, type: row.type, value: Number(row.value), quantity: row.quantity,
    probability: row.probability_ppm === null ? null : row.probability_ppm / 10_000 } as const;
}
function winningEntry(entry: LotteryEntry, prize: PrizeRow): LotteryEntry { return { ...entry, status: "won", prizeId: prize.id,
  prizeName: prize.name, prizeType: prize.type, prizeValue: Number(prize.value), rewardStatus: "pending" }; }
function losingEntry(entry: LotteryEntry): LotteryEntry { return { ...entry, status: "not_won", rewardStatus: null }; }
function entryKey(entry: LotteryEntry): EntryKey { return { campaignId: entry.campaignId, userId: entry.sub2apiUserId, participationKey: entry.participationKey }; }
function entryValues(entry: LotteryEntry) { return [entry.id, entry.campaignId, entry.participationKey, entry.sub2apiUserId,
  entry.maskedEmail, entry.status, entry.prizeId, entry.prizeName, entry.prizeType, entry.prizeValue,
  entry.redemptionCode, entry.rewardCodeId, entry.createdAt, entry.updatedAt]; }
type EntryKey = Readonly<{ campaignId: string; userId: string; participationKey: string }>;
type DrawPlan = ScheduledDraw & Readonly<{
  assignments: ReturnType<ScheduledDraw["choose"]>;
  prizeRows: readonly PrizeRow[];
}>;
type WinnerPlan = DrawPlan & Readonly<{ assignment: DrawPlan["assignments"][number]; prize: PrizeRow }>;
