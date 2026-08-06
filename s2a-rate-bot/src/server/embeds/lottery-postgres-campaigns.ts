import type { PoolClient } from "pg";
import { parseEligibilityConditions } from "./lottery-validation.ts";
import type { StoredCampaign } from "./lottery-store-contract.ts";
import {
  type CampaignRow, type LotteryExecutor, type LotteryPostgresContext, type PrizeRow,
  iso, mapPrize, nullableIso, withTransaction,
} from "./lottery-postgres-types.ts";

export const CAMPAIGN_COLUMNS = `id,name,description,draw_mode,participation_mode,status,
  registration_start,registration_end,draw_at,visible_to_users,eligibility_json,public_winners,
  created_at,updated_at,drawn_at,last_error`;
export const PRIZE_COLUMNS = `id,campaign_id,name,type,value,quantity,remaining_quantity,probability_ppm,sort_order`;

export async function listPostgresCampaigns(context: LotteryPostgresContext) {
  await context.ready;
  const result = await context.pool.query<CampaignRow>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM lottery_campaigns ORDER BY created_at DESC,id DESC`,
  );
  const prizes = await prizesByCampaign(context.pool, result.rows.map((row) => row.id));
  return result.rows.map((row) => mapCampaign(row, prizes.get(row.id) ?? []));
}

export async function getPostgresCampaign(context: LotteryPostgresContext, id: string) {
  await context.ready;
  return readCampaign(context.pool, id);
}

export function createPostgresCampaign(context: LotteryPostgresContext, campaign: StoredCampaign) {
  return withTransaction(context, async (client) => {
    await insertCampaign(client, campaign);
    await insertPrizes(client, campaign);
    return requiredCampaign(client, campaign.id);
  });
}

export function updatePostgresCampaign(context: LotteryPostgresContext, campaign: StoredCampaign) {
  return withTransaction(context, async (client) => {
    const current = await readCampaignRow(client, campaign.id, true);
    if (!current || ["drawn", "exhausted", "cancelled", "drawing"].includes(current.status)) return null;
    const entries = await client.query("SELECT 1 FROM lottery_entries WHERE campaign_id=$1 AND status!='withdrawn' LIMIT 1", [campaign.id]);
    if (entries.rowCount) return null;
    await updateCampaignRow(client, campaign);
    await client.query("DELETE FROM lottery_prizes WHERE campaign_id=$1", [campaign.id]);
    await insertPrizes(client, campaign);
    return requiredCampaign(client, campaign.id);
  });
}

export function setPostgresCampaignVisibility(
  context: LotteryPostgresContext,
  input: Readonly<{ id: string; visible: boolean; timestamp: string }>,
) {
  return withTransaction(context, async (client) => {
    const result = await client.query(`UPDATE lottery_campaigns SET visible_to_users=$2,updated_at=$3
      WHERE id=$1 RETURNING id`, [input.id, input.visible, input.timestamp]);
    return result.rowCount ? requiredCampaign(client, input.id) : null;
  });
}

export function cancelPostgresCampaign(
  context: LotteryPostgresContext,
  input: Readonly<{ id: string; timestamp: string }>,
) {
  return withTransaction(context, async (client) => {
    const result = await client.query(`UPDATE lottery_campaigns SET status='cancelled',last_error=NULL,updated_at=$2
      WHERE id=$1 AND status IN ('scheduled','open','closed') RETURNING id`, [input.id, input.timestamp]);
    return result.rowCount ? requiredCampaign(client, input.id) : null;
  });
}

export async function readCampaign(executor: LotteryExecutor, id: string) {
  const row = await readCampaignRow(executor, id, false);
  if (!row) return null;
  const prizes = await readPrizeRows(executor, id);
  return mapCampaign(row, prizes);
}

export async function requiredCampaign(executor: LotteryExecutor, id: string) {
  const campaign = await readCampaign(executor, id);
  if (!campaign) throw new Error("抽奖活动不存在");
  return campaign;
}

export async function readCampaignRow(executor: LotteryExecutor, id: string, lock: boolean) {
  const result = await executor.query<CampaignRow>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM lottery_campaigns WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function readPrizeRows(executor: LotteryExecutor, campaignId: string) {
  const result = await executor.query<PrizeRow>(
    `SELECT ${PRIZE_COLUMNS} FROM lottery_prizes WHERE campaign_id=$1 ORDER BY sort_order,id`,
    [campaignId],
  );
  return result.rows;
}

function mapCampaign(row: CampaignRow, prizeRows: readonly PrizeRow[]): StoredCampaign {
  return {
    id: row.id, name: row.name, description: row.description, drawMode: row.draw_mode,
    participationMode: row.participation_mode, status: row.status,
    registrationStart: nullableIso(row.registration_start), registrationEnd: nullableIso(row.registration_end),
    drawAt: nullableIso(row.draw_at), visibleToUsers: row.visible_to_users,
    eligibilityConditions: parseEligibilityConditions(row.eligibility_json), publicWinners: row.public_winners,
    prizes: prizeRows.map(mapPrize), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    drawnAt: nullableIso(row.drawn_at), lastError: row.last_error,
  };
}

async function prizesByCampaign(executor: LotteryExecutor, ids: readonly string[]) {
  if (!ids.length) return new Map<string, PrizeRow[]>();
  const result = await executor.query<PrizeRow>(
    `SELECT ${PRIZE_COLUMNS} FROM lottery_prizes WHERE campaign_id=ANY($1::text[]) ORDER BY sort_order,id`,
    [ids],
  );
  const grouped = new Map<string, PrizeRow[]>();
  for (const row of result.rows) grouped.set(row.campaign_id, [...(grouped.get(row.campaign_id) ?? []), row]);
  return grouped;
}

async function insertCampaign(client: PoolClient, campaign: StoredCampaign) {
  await client.query(`INSERT INTO lottery_campaigns
    (id,name,description,draw_mode,participation_mode,status,registration_start,registration_end,draw_at,
      visible_to_users,eligibility_json,public_winners,created_at,updated_at,drawn_at,last_error)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)`, [
    campaign.id, campaign.name, campaign.description, campaign.drawMode, campaign.participationMode,
    campaign.status, campaign.registrationStart, campaign.registrationEnd, campaign.drawAt,
    campaign.visibleToUsers, JSON.stringify(campaign.eligibilityConditions), campaign.publicWinners,
    campaign.createdAt, campaign.updatedAt, campaign.drawnAt, campaign.lastError,
  ]);
}

async function updateCampaignRow(client: PoolClient, campaign: StoredCampaign) {
  await client.query(`UPDATE lottery_campaigns SET name=$2,description=$3,draw_mode=$4,participation_mode=$5,
    status=$6,registration_start=$7,registration_end=$8,draw_at=$9,visible_to_users=$10,
    eligibility_json=$11::jsonb,public_winners=$12,updated_at=$13,last_error=NULL WHERE id=$1`, [
    campaign.id, campaign.name, campaign.description, campaign.drawMode, campaign.participationMode,
    campaign.status, campaign.registrationStart, campaign.registrationEnd, campaign.drawAt,
    campaign.visibleToUsers, JSON.stringify(campaign.eligibilityConditions), campaign.publicWinners,
    campaign.updatedAt,
  ]);
}

async function insertPrizes(client: PoolClient, campaign: StoredCampaign) {
  for (const [index, prize] of campaign.prizes.entries()) {
    await client.query(`INSERT INTO lottery_prizes
      (id,campaign_id,name,type,value,quantity,remaining_quantity,probability_ppm,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)`, [
      prize.id, campaign.id, prize.name, prize.type, prize.value, prize.quantity,
      prize.probability === null ? null : Math.round(prize.probability * 10_000), index,
    ]);
  }
}
