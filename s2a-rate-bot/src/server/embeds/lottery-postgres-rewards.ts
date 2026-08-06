import type { QueryResultRow } from "pg";
import type {
  LotteryRewardJob, RewardClaim, RewardCompletion, RewardFailure,
} from "./lottery-store-contract.ts";
import type { LotteryExecutor, LotteryPostgresContext } from "./lottery-postgres-types.ts";
import { iso, withTransaction } from "./lottery-postgres-types.ts";

type RewardJobRow = QueryResultRow & {
  id: string; campaign_id: string; entry_id: string; type: LotteryRewardJob["type"];
  value: number; attempt_count: number; idempotency_key: string; locked_at: Date; lock_token: string;
};

export async function claimPostgresRewardJobs(context: LotteryPostgresContext, input: RewardClaim) {
  await context.ready;
  const result = await context.pool.query<RewardJobRow>(`WITH picked AS (
      SELECT id FROM lottery_reward_jobs
      WHERE (status IN ('pending','retryable_failed') AND next_attempt_at <= now())
        OR (status='processing' AND locked_at < $2)
      ORDER BY next_attempt_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE lottery_reward_jobs j SET status='processing',locked_at=now(),lock_token=gen_random_uuid()::text,
      attempt_count=attempt_count+1,updated_at=now()
    FROM picked WHERE j.id=picked.id
    RETURNING j.id,j.campaign_id,j.entry_id,j.type,j.value,j.attempt_count,j.idempotency_key,j.locked_at,j.lock_token`,
  [input.limit, input.staleBefore]);
  return result.rows.map(mapJob);
}

export function completePostgresRewardJob(context: LotteryPostgresContext, input: RewardCompletion) {
  return withTransaction(context, async (client) => {
    const result = await client.query(`UPDATE lottery_reward_jobs SET status='fulfilled',last_error=NULL,
      locked_at=NULL,lock_token=NULL,fulfilled_at=$3,updated_at=$3
      WHERE id=$1 AND status='processing' AND lock_token=$2 RETURNING entry_id,campaign_id`,
    [input.job.id, input.job.lockToken, input.timestamp]);
    const row = result.rows[0] as { entry_id: string; campaign_id: string } | undefined;
    if (!row) return false;
    const entry = await client.query(`UPDATE lottery_entries SET redemption_code=$2,reward_code_id=$3,updated_at=$4
      WHERE id=$1 AND status='won' RETURNING id`, [
      row.entry_id, input.rewardCode, input.rewardCodeId, input.timestamp,
    ]);
    if (!entry.rowCount) throw new Error(`中奖记录 ${row.entry_id} 状态异常`);
    await clearCampaignErrorWhenSettled(client, row.campaign_id, input.timestamp);
    return true;
  });
}

export function failPostgresRewardJob(context: LotteryPostgresContext, input: RewardFailure) {
  return withTransaction(context, async (client) => {
    const result = await client.query(`UPDATE lottery_reward_jobs SET status='retryable_failed',last_error=$3,
      next_attempt_at=$4,locked_at=NULL,lock_token=NULL,updated_at=$5
      WHERE id=$1 AND status='processing' AND lock_token=$2
      RETURNING campaign_id`, [
      input.job.id, input.job.lockToken, input.message, input.nextAttemptAt, input.timestamp,
    ]);
    const campaignId = (result.rows[0] as { campaign_id: string } | undefined)?.campaign_id;
    if (!campaignId) return false;
    await client.query("UPDATE lottery_campaigns SET last_error=$2,updated_at=$3 WHERE id=$1",
      [campaignId, input.message, input.timestamp]);
    return true;
  });
}

function mapJob(row: RewardJobRow): LotteryRewardJob {
  return {
    id: row.id, campaignId: row.campaign_id, entryId: row.entry_id, type: row.type,
    value: Number(row.value), attemptCount: row.attempt_count, idempotencyKey: row.idempotency_key,
    lockedAt: iso(row.locked_at), lockToken: row.lock_token,
  };
}

async function clearCampaignErrorWhenSettled(
  executor: LotteryExecutor,
  campaignId: string,
  timestamp: string,
) {
  await executor.query(`UPDATE lottery_campaigns SET last_error=NULL,updated_at=$2 WHERE id=$1
    AND NOT EXISTS (SELECT 1 FROM lottery_reward_jobs WHERE campaign_id=$1 AND status='retryable_failed')`,
  [campaignId, timestamp]);
}
