import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { CompensationClaim } from "./types.ts";

export type CompensationClaimStore = Readonly<{
  create: (claim: CompensationClaim) => CompensationClaim;
  complete: (id: string, reward: Readonly<{ code: string; id: number }> | null, updatedAt: string) => CompensationClaim;
  fail: (id: string, errorMessage: string, updatedAt: string) => CompensationClaim;
  list: () => readonly CompensationClaim[];
  close: () => void;
}>;

export function createSqliteCompensationClaimStore(databaseUrl: string): CompensationClaimStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    create: (claim) => createClaim(database, claim),
    complete: (id, reward, updatedAt) => completeClaim({ database, id, reward, updatedAt }),
    fail: (id, message, updatedAt) => failClaim({ database, id, message, updatedAt }),
    list: () => listClaims(database),
    close: () => database.close(),
  };
}

function createClaim(database: DatabaseSync, claim: CompensationClaim) {
  database.prepare(`INSERT INTO embed_compensation_claims
    (id, src_host, sub2api_user_id, masked_email, store_name, status, results_json,
      eligible_order_count, invalid_order_count, total_compensation_fen,
      redemption_code, reward_code_id, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(claim.id, claim.srcHost, claim.sub2apiUserId, claim.maskedEmail, claim.storeName,
      claim.status, JSON.stringify(claim.results), claim.summary.eligibleOrderCount,
      claim.summary.invalidOrderCount, claim.summary.totalCompensationFen,
      claim.redemptionCode, claim.rewardCodeId, claim.errorMessage, claim.createdAt, claim.updatedAt);
  return requiredClaim(database, claim.id);
}

function completeClaim(input: Readonly<{
  database: DatabaseSync;
  id: string;
  reward: Readonly<{ code: string; id: number }> | null;
  updatedAt: string;
}>) {
  const result = input.database.prepare(`UPDATE embed_compensation_claims
    SET status = 'completed', redemption_code = ?, reward_code_id = ?,
      error_message = NULL, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .run(input.reward?.code ?? null, input.reward?.id ?? null, input.updatedAt, input.id);
  if (result.changes !== 1) throw new Error("补偿发码记录状态已变化");
  return requiredClaim(input.database, input.id);
}

function failClaim(input: Readonly<{
  database: DatabaseSync;
  id: string;
  message: string;
  updatedAt: string;
}>) {
  const result = input.database.prepare(`UPDATE embed_compensation_claims
    SET status = 'failed', error_message = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'`).run(input.message, input.updatedAt, input.id);
  if (result.changes !== 1) throw new Error("补偿发码记录状态已变化");
  return requiredClaim(input.database, input.id);
}

function listClaims(database: DatabaseSync) {
  return (database.prepare("SELECT * FROM embed_compensation_claims ORDER BY created_at DESC, id DESC")
    .all() as ClaimRow[]).map(mapClaim);
}

function requiredClaim(database: DatabaseSync, id: string) {
  const row = database.prepare("SELECT * FROM embed_compensation_claims WHERE id = ?").get(id) as ClaimRow | undefined;
  if (!row) throw new Error("补偿发码记录不存在");
  return mapClaim(row);
}

function mapClaim(row: ClaimRow): CompensationClaim {
  return {
    id: row.id,
    srcHost: row.src_host,
    sub2apiUserId: row.sub2api_user_id,
    maskedEmail: row.masked_email,
    storeName: row.store_name,
    status: row.status,
    results: JSON.parse(row.results_json) as CompensationClaim["results"],
    summary: {
      eligibleOrderCount: row.eligible_order_count,
      invalidOrderCount: row.invalid_order_count,
      totalCompensationFen: row.total_compensation_fen,
    },
    redemptionCode: row.redemption_code,
    rewardCodeId: row.reward_code_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ClaimRow = Readonly<{
  id: string;
  src_host: string;
  sub2api_user_id: string;
  masked_email: string;
  store_name: string;
  status: CompensationClaim["status"];
  results_json: string;
  eligible_order_count: number;
  invalid_order_count: number;
  total_compensation_fen: number;
  redemption_code: string | null;
  reward_code_id: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}>;
