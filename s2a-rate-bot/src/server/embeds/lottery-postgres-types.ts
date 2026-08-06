import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { LotteryEntry, LotteryPrize } from "./types.ts";
import type { StoredCampaign } from "./lottery-store-contract.ts";

export type LotteryPostgresContext = Readonly<{ pool: Pool; ready: Promise<void> }>;
export type LotteryExecutor = Pick<Pool | PoolClient, "query">;

export type CampaignRow = QueryResultRow & {
  id: string; name: string; description: string; draw_mode: StoredCampaign["drawMode"];
  participation_mode: StoredCampaign["participationMode"]; status: StoredCampaign["status"];
  registration_start: Date | null; registration_end: Date | null; draw_at: Date | null;
  visible_to_users: boolean; eligibility_json: unknown; public_winners: boolean;
  created_at: Date; updated_at: Date; drawn_at: Date | null; last_error: string | null;
};

export type PrizeRow = QueryResultRow & {
  id: string; campaign_id: string; name: string; type: LotteryPrize["type"];
  value: number; quantity: number; remaining_quantity: number; probability_ppm: number | null;
  sort_order: number;
};

export type EntryRow = QueryResultRow & {
  id: string; campaign_id: string; participation_key: string; sub2api_user_id: string;
  masked_email: string; status: LotteryEntry["status"]; prize_id: string | null;
  prize_name: string | null; prize_type: LotteryPrize["type"] | null; prize_value: number | null;
  redemption_code: string | null; reward_code_id: string | number | null;
  reward_status: LotteryEntry["rewardStatus"];
  created_at: Date; updated_at: Date;
};

export async function withTransaction<T>(context: LotteryPostgresContext, task: (client: PoolClient) => Promise<T>) {
  await context.ready;
  const client = await context.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function mapEntry(row: EntryRow): LotteryEntry {
  return {
    id: row.id, campaignId: row.campaign_id, participationKey: row.participation_key,
    sub2apiUserId: row.sub2api_user_id, maskedEmail: row.masked_email, status: row.status,
    prizeId: row.prize_id, prizeName: row.prize_name, prizeType: row.prize_type,
    prizeValue: nullableNumber(row.prize_value), redemptionCode: row.redemption_code,
    rewardCodeId: nullableNumber(row.reward_code_id), rewardStatus: row.reward_status,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

export function mapPrize(row: PrizeRow): LotteryPrize {
  return {
    id: row.id, name: row.name, type: row.type, value: Number(row.value),
    quantity: row.quantity, probability: row.probability_ppm === null ? null : row.probability_ppm / 10_000,
  };
}

export function iso(value: Date | string) { return new Date(value).toISOString(); }
export function nullableIso(value: Date | string | null) { return value ? iso(value) : null; }
function nullableNumber(value: string | number | null) { return value === null ? null : Number(value); }
