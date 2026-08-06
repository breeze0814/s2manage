import { execute, row, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { CompensationClaimStore } from "./claim-store.ts";
import type { CompensationClaim } from "./types.ts";

type ClaimRow = { id: string; src_host: string; sub2api_user_id: string; masked_email: string;
  store_name: string; status: CompensationClaim["status"]; results_json: string;
  eligible_order_count: number; invalid_order_count: number; total_compensation_fen: number;
  redemption_code: string | null; reward_code_id: number | null; error_message: string | null;
  created_at: string; updated_at: string };

export function createPostgresCompensationClaimStore(context: PostgresContext): CompensationClaimStore {
  return {
    create: (claim) => createClaim(context, claim),
    complete: (id, reward, updatedAt) => finishClaim(context, { id, reward, updatedAt }),
    fail: (id, message, updatedAt) => failClaim(context, { id, message, updatedAt }),
    list: async () => (await rows<ClaimRow>(context,
      "SELECT * FROM embed_compensation_claims ORDER BY created_at DESC,id DESC")).map(mapClaim),
    close: async () => undefined,
  };
}

async function createClaim(context: PostgresContext, claim: CompensationClaim) {
  await execute(context, `INSERT INTO embed_compensation_claims
    (id,src_host,sub2api_user_id,masked_email,store_name,status,results_json,eligible_order_count,
      invalid_order_count,total_compensation_fen,redemption_code,reward_code_id,error_message,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [claim.id, claim.srcHost,
    claim.sub2apiUserId, claim.maskedEmail, claim.storeName, claim.status, JSON.stringify(claim.results),
    claim.summary.eligibleOrderCount, claim.summary.invalidOrderCount, claim.summary.totalCompensationFen,
    claim.redemptionCode, claim.rewardCodeId, claim.errorMessage, claim.createdAt, claim.updatedAt]);
  return requiredClaim(context, claim.id);
}

async function finishClaim(context: PostgresContext, input: Readonly<{
  id: string; reward: Readonly<{ code: string; id: number }> | null; updatedAt: string;
}>) {
  const result = await execute(context, `UPDATE embed_compensation_claims SET status='completed',
    redemption_code=$2,reward_code_id=$3,error_message=NULL,updated_at=$4 WHERE id=$1 AND status='pending'`,
  [input.id, input.reward?.code ?? null, input.reward?.id ?? null, input.updatedAt]);
  if (result.rowCount !== 1) throw new Error("补偿发码记录状态已变化");
  return requiredClaim(context, input.id);
}

async function failClaim(context: PostgresContext, input: Readonly<{ id: string; message: string; updatedAt: string }>) {
  const result = await execute(context, `UPDATE embed_compensation_claims SET status='failed',
    error_message=$2,updated_at=$3 WHERE id=$1 AND status='pending'`, [input.id, input.message, input.updatedAt]);
  if (result.rowCount !== 1) throw new Error("补偿发码记录状态已变化");
  return requiredClaim(context, input.id);
}

async function requiredClaim(context: PostgresContext, id: string) {
  const value = await row<ClaimRow>(context, "SELECT * FROM embed_compensation_claims WHERE id=$1", [id]);
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
