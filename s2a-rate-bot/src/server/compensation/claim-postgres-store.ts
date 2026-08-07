import {
  postgresTransaction,
  rows,
  type PostgresContext,
  type PostgresExecutor,
} from "../infrastructure/postgres-context.ts";
import type { CompensationClaimStore, CompensationOrderRedemption } from "./claim-store.ts";
import { CompensationOrderConflictError } from "./errors.ts";
import type { CompensationClaim } from "./types.ts";

type ClaimRow = { id: string; src_host: string; sub2api_user_id: string; masked_email: string;
  store_name: string; status: CompensationClaim["status"]; results_json: string;
  eligible_order_count: number; invalid_order_count: number; total_compensation_fen: number;
  redemption_code: string | null; reward_code_id: number | null; error_message: string | null;
  created_at: string; updated_at: string };
type RedemptionRow = { claim_id: string; status: CompensationOrderRedemption["status"] };

export function createPostgresCompensationClaimStore(context: PostgresContext): CompensationClaimStore {
  return {
    create: (claim, tradeNumbers) => createClaim(context, claim, tradeNumbers),
    findRedemption: (tradeNumber) => findRedemption(context, tradeNumber),
    complete: (id, reward, updatedAt) => finishClaim(context, { id, reward, updatedAt }),
    fail: (id, message, updatedAt) => failClaim(context, { id, message, updatedAt }),
    list: async () => (await rows<ClaimRow>(context,
      "SELECT * FROM embed_compensation_claims ORDER BY created_at DESC,id DESC")).map(mapClaim),
    close: async () => undefined,
  };
}

async function findRedemption(context: PostgresContext, tradeNumber: string): Promise<CompensationOrderRedemption | null> {
  const value = (await rows<RedemptionRow>(context, `SELECT claim_id,status
    FROM embed_compensation_order_redemptions WHERE trade_no=$1`, [tradeNumber]))[0];
  if (!value) return null;
  return Object.freeze({
    tradeNumber,
    status: value.status,
    claim: await requiredClaim(context.pool, value.claim_id),
  });
}

function createClaim(context: PostgresContext, claim: CompensationClaim, tradeNumbers: readonly string[]) {
  return postgresTransaction(context, async (client) => {
    await insertClaim(client, claim);
    await reserveOrders(client, claim, tradeNumbers);
    return requiredClaim(client, claim.id);
  });
}

async function insertClaim(executor: PostgresExecutor, claim: CompensationClaim) {
  await executor.query(`INSERT INTO embed_compensation_claims
    (id,src_host,sub2api_user_id,masked_email,store_name,status,results_json,eligible_order_count,
      invalid_order_count,total_compensation_fen,redemption_code,reward_code_id,error_message,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [claim.id, claim.srcHost,
    claim.sub2apiUserId, claim.maskedEmail, claim.storeName, claim.status, JSON.stringify(claim.results),
    claim.summary.eligibleOrderCount, claim.summary.invalidOrderCount, claim.summary.totalCompensationFen,
    claim.redemptionCode, claim.rewardCodeId, claim.errorMessage, claim.createdAt, claim.updatedAt]);
}

async function reserveOrders(executor: PostgresExecutor, claim: CompensationClaim, tradeNumbers: readonly string[]) {
  for (const tradeNumber of tradeNumbers) {
    const result = await executor.query(`INSERT INTO embed_compensation_order_redemptions
      (trade_no,claim_id,status,reserved_at,redeemed_at) VALUES ($1,$2,'reserved',$3,NULL)
      ON CONFLICT (trade_no) DO NOTHING RETURNING trade_no`, [tradeNumber, claim.id, claim.createdAt]);
    if (result.rowCount !== 1) throw new CompensationOrderConflictError(tradeNumber);
  }
}

function finishClaim(context: PostgresContext, input: Readonly<{
  id: string; reward: Readonly<{ code: string; id: number }> | null; updatedAt: string;
}>) {
  return postgresTransaction(context, async (client) => {
    const result = await client.query(`UPDATE embed_compensation_claims SET status='completed',
      redemption_code=$2,reward_code_id=$3,error_message=NULL,updated_at=$4 WHERE id=$1 AND status='pending'`,
    [input.id, input.reward?.code ?? null, input.reward?.id ?? null, input.updatedAt]);
    if (result.rowCount !== 1) throw new Error("补偿发码记录状态已变化");
    if (input.reward) await markOrdersRedeemed(client, input.id, input.updatedAt);
    return requiredClaim(client, input.id);
  });
}

async function markOrdersRedeemed(executor: PostgresExecutor, claimId: string, redeemedAt: string) {
  const result = await executor.query(`UPDATE embed_compensation_order_redemptions
    SET status='redeemed',redeemed_at=$2 WHERE claim_id=$1 AND status='reserved'`, [claimId, redeemedAt]);
  if (!result.rowCount) throw new Error("补偿订单占用记录不存在");
}

function failClaim(context: PostgresContext, input: Readonly<{ id: string; message: string; updatedAt: string }>) {
  return postgresTransaction(context, async (client) => {
    const result = await client.query(`UPDATE embed_compensation_claims SET status='failed',
      error_message=$2,updated_at=$3 WHERE id=$1 AND status='pending'`, [input.id, input.message, input.updatedAt]);
    if (result.rowCount !== 1) throw new Error("补偿发码记录状态已变化");
    await client.query(`DELETE FROM embed_compensation_order_redemptions
      WHERE claim_id=$1 AND status='reserved'`, [input.id]);
    return requiredClaim(client, input.id);
  });
}

async function requiredClaim(executor: PostgresExecutor, id: string) {
  const result = await executor.query<ClaimRow>("SELECT * FROM embed_compensation_claims WHERE id=$1", [id]);
  const value = result.rows[0];
  if (!value) throw new Error("补偿发码记录不存在");
  return mapClaim(value);
}

function mapClaim(value: ClaimRow): CompensationClaim {
  return { id: value.id, srcHost: value.src_host, sub2apiUserId: value.sub2api_user_id,
    maskedEmail: value.masked_email, storeName: value.store_name, status: value.status,
    results: JSON.parse(value.results_json) as CompensationClaim["results"],
    summary: { eligibleOrderCount: value.eligible_order_count, invalidOrderCount: value.invalid_order_count,
      totalCompensationFen: value.total_compensation_fen }, redemptionCode: value.redemption_code,
    rewardCodeId: value.reward_code_id, errorMessage: value.error_message,
    createdAt: value.created_at, updatedAt: value.updated_at };
}
