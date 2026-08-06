import type { DatabaseSync } from "node:sqlite";
import type { PoolClient } from "pg";

type LegacyCampaign = Record<string, unknown> & { id: string; prizes_json: string };
type LegacyEntry = Record<string, unknown> & { id: string; campaign_id: string; status: string };
type LegacyPrize = { id: string; name: string; type: "balance" | "subscription";
  value: number; quantity: number; probability?: number | null };

export async function importLegacyLottery(database: DatabaseSync, client: PoolClient) {
  if (!tableExists(database, "embed_lottery_campaigns")) return { campaigns: 0, prizes: 0, entries: 0, rewardJobs: 0 };
  const campaigns = database.prepare("SELECT * FROM embed_lottery_campaigns ORDER BY created_at,id").all() as LegacyCampaign[];
  const entries = tableExists(database, "embed_lottery_entries")
    ? database.prepare("SELECT * FROM embed_lottery_entries ORDER BY created_at,id").all() as LegacyEntry[]
    : [];
  let prizes = 0;
  let rewardJobs = 0;
  for (const campaign of campaigns) {
    await upsertCampaign(client, campaign);
    prizes += await upsertPrizes(client, campaign, entries);
  }
  for (const entry of entries) {
    await upsertEntry(client, entry);
    if (entry.status === "won") { await upsertRewardJob(client, entry); rewardJobs += 1; }
  }
  return { campaigns: campaigns.length, prizes, entries: entries.length, rewardJobs };
}

async function upsertCampaign(client: PoolClient, value: LegacyCampaign) {
  const eligibility = normalizedJson(value.eligibility_json, `抽奖活动 ${value.id} 的参与条件`);
  await client.query(`INSERT INTO lottery_campaigns
    (id,name,description,draw_mode,participation_mode,status,registration_start,registration_end,draw_at,
      visible_to_users,eligibility_json,public_winners,created_at,updated_at,drawn_at,last_error)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,draw_mode=EXCLUDED.draw_mode,
      participation_mode=EXCLUDED.participation_mode,status=EXCLUDED.status,registration_start=EXCLUDED.registration_start,
      registration_end=EXCLUDED.registration_end,draw_at=EXCLUDED.draw_at,visible_to_users=EXCLUDED.visible_to_users,
      eligibility_json=EXCLUDED.eligibility_json,public_winners=EXCLUDED.public_winners,updated_at=EXCLUDED.updated_at,
      drawn_at=EXCLUDED.drawn_at,last_error=EXCLUDED.last_error`, [value.id, value.name, value.description,
    value.draw_mode, value.participation_mode ?? "once", value.status, value.registration_start,
    value.registration_end, value.draw_at, boolean(value.visible_to_users), eligibility,
    boolean(value.public_winners), value.created_at, value.updated_at, value.drawn_at, value.last_error]);
}

async function upsertPrizes(client: PoolClient, campaign: LegacyCampaign, entries: readonly LegacyEntry[]) {
  const prizes = parsedPrizes(campaign);
  for (const [index, prize] of prizes.entries()) {
    const awarded = entries.filter((entry) => entry.campaign_id === campaign.id
      && entry.status === "won" && String(entry.prize_id) === prize.id).length;
    if (awarded > prize.quantity) throw new Error(`抽奖活动 ${campaign.id} 的奖品 ${prize.id} 中奖数超过库存`);
    await client.query(`INSERT INTO lottery_prizes
      (id,campaign_id,name,type,value,quantity,remaining_quantity,probability_ppm,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET campaign_id=EXCLUDED.campaign_id,
      name=EXCLUDED.name,type=EXCLUDED.type,value=EXCLUDED.value,quantity=EXCLUDED.quantity,
      remaining_quantity=EXCLUDED.remaining_quantity,probability_ppm=EXCLUDED.probability_ppm,sort_order=EXCLUDED.sort_order`,
    [prize.id, campaign.id, prize.name, prize.type, prize.value, prize.quantity, prize.quantity - awarded,
      prize.probability === null || prize.probability === undefined ? null : Math.round(prize.probability * 10_000), index]);
  }
  return prizes.length;
}

async function upsertEntry(client: PoolClient, value: LegacyEntry) {
  await client.query(`INSERT INTO lottery_entries
    (id,campaign_id,participation_key,sub2api_user_id,masked_email,status,prize_id,prize_name,
      prize_type,prize_value,redemption_code,reward_code_id,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET
      campaign_id=EXCLUDED.campaign_id,participation_key=EXCLUDED.participation_key,
      sub2api_user_id=EXCLUDED.sub2api_user_id,masked_email=EXCLUDED.masked_email,status=EXCLUDED.status,
      prize_id=EXCLUDED.prize_id,prize_name=EXCLUDED.prize_name,prize_type=EXCLUDED.prize_type,
      prize_value=EXCLUDED.prize_value,redemption_code=EXCLUDED.redemption_code,
      reward_code_id=EXCLUDED.reward_code_id,updated_at=EXCLUDED.updated_at`, [value.id, value.campaign_id,
    value.participation_key ?? "campaign", value.sub2api_user_id, value.masked_email, value.status,
    value.prize_id, value.prize_name, value.prize_type, value.prize_value, value.redemption_code,
    value.reward_code_id, value.created_at, value.updated_at]);
}

async function upsertRewardJob(client: PoolClient, value: LegacyEntry) {
  if (!value.prize_id || !value.prize_type || value.prize_value === null || value.prize_value === undefined) {
    throw new Error(`中奖记录缺少奖品信息: ${value.id}`);
  }
  const fulfilled = Boolean(value.redemption_code);
  await client.query(`INSERT INTO lottery_reward_jobs
    (id,campaign_id,entry_id,prize_id,type,value,status,next_attempt_at,idempotency_key,
      created_at,updated_at,fulfilled_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(entry_id) DO UPDATE SET
      prize_id=EXCLUDED.prize_id,type=EXCLUDED.type,value=EXCLUDED.value,status=EXCLUDED.status,
      next_attempt_at=EXCLUDED.next_attempt_at,updated_at=EXCLUDED.updated_at,fulfilled_at=EXCLUDED.fulfilled_at`,
  [`legacy-${value.id}`, value.campaign_id, value.id, value.prize_id, value.prize_type, value.prize_value,
    fulfilled ? "fulfilled" : "pending", value.updated_at, `legacy-lottery-entry:${value.id}`,
    value.created_at, value.updated_at, fulfilled ? value.updated_at : null]);
}

function parsedPrizes(campaign: LegacyCampaign): LegacyPrize[] {
  const parsed = JSON.parse(campaign.prizes_json) as unknown;
  if (!Array.isArray(parsed) || parsed.some((value) => !validPrize(value))) {
    throw new Error(`抽奖活动 ${campaign.id} 的奖品 JSON 无效`);
  }
  return parsed;
}

function validPrize(value: unknown): value is LegacyPrize {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prize = value as Record<string, unknown>;
  return typeof prize.id === "string" && typeof prize.name === "string"
    && (prize.type === "balance" || prize.type === "subscription")
    && typeof prize.value === "number" && typeof prize.quantity === "number"
    && (prize.probability === null || prize.probability === undefined || typeof prize.probability === "number");
}

function normalizedJson(value: unknown, label: string) {
  try { return JSON.stringify(JSON.parse(String(value))); } catch (error) { throw new Error(`${label} JSON 无效`, { cause: error }); }
}
function tableExists(database: DatabaseSync, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
function boolean(value: unknown) { return value === true || Number(value) === 1; }
