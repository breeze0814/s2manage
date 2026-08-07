import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath, transaction } from "../../storage/sqlite-utils.ts";
import type { CompensationClaim } from "./types.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";
import { CompensationOrderConflictError } from "./errors.ts";

export type CompensationClaimStore = Readonly<{
  create: (claim: CompensationClaim, tradeNumbers: readonly string[]) => Awaitable<CompensationClaim>;
  findRedemption: (tradeNumber: string) => Awaitable<CompensationOrderRedemption | null>;
  complete: (id: string, reward: Readonly<{ code: string; id: number }> | null, updatedAt: string) => Awaitable<CompensationClaim>;
  fail: (id: string, errorMessage: string, updatedAt: string) => Awaitable<CompensationClaim>;
  list: () => Awaitable<readonly CompensationClaim[]>;
  close: () => Awaitable<void>;
}>;

export type CompensationOrderRedemption = Readonly<{
  tradeNumber: string;
  status: "reserved" | "redeemed";
  claim: CompensationClaim;
}>;

export function createSqliteCompensationClaimStore(databaseUrl: string): CompensationClaimStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    create: (claim, tradeNumbers) => createClaim(database, claim, tradeNumbers),
    findRedemption: (tradeNumber) => findRedemption(database, tradeNumber),
    complete: (id, reward, updatedAt) => completeClaim({ database, id, reward, updatedAt }),
    fail: (id, message, updatedAt) => failClaim({ database, id, message, updatedAt }),
    list: () => listClaims(database),
    close: () => database.close(),
  };
}

function findRedemption(database: DatabaseSync, tradeNumber: string): CompensationOrderRedemption | null {
  const value = database.prepare(`SELECT claim_id, status
    FROM embed_compensation_order_redemptions WHERE trade_no = ?`).get(tradeNumber) as RedemptionRow | undefined;
  if (!value) return null;
  return Object.freeze({ tradeNumber, status: value.status, claim: requiredClaim(database, value.claim_id) });
}

function createClaim(database: DatabaseSync, claim: CompensationClaim, tradeNumbers: readonly string[]) {
  let created: CompensationClaim | null = null;
  transaction(database, () => {
    insertClaim(database, claim);
    reserveOrders(database, claim, tradeNumbers);
    created = requiredClaim(database, claim.id);
  });
  if (!created) throw new Error("补偿发码记录创建失败");
  return created;
}

function insertClaim(database: DatabaseSync, claim: CompensationClaim) {
  database.prepare(`INSERT INTO embed_compensation_claims
    (id, src_host, sub2api_user_id, sub2api_email, masked_email, store_name, status, results_json,
      eligible_order_count, invalid_order_count, total_compensation_fen,
      redemption_code, reward_code_id, error_message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(claim.id, claim.srcHost, claim.sub2apiUserId, claim.sub2apiEmail, claim.maskedEmail, claim.storeName,
      claim.status, JSON.stringify(claim.results), claim.summary.eligibleOrderCount,
      claim.summary.invalidOrderCount, claim.summary.totalCompensationFen,
      claim.redemptionCode, claim.rewardCodeId, claim.errorMessage, claim.createdAt, claim.updatedAt);
}

function reserveOrders(database: DatabaseSync, claim: CompensationClaim, tradeNumbers: readonly string[]) {
  const statement = database.prepare(`INSERT OR IGNORE INTO embed_compensation_order_redemptions
    (trade_no, claim_id, status, reserved_at, redeemed_at) VALUES (?, ?, 'reserved', ?, NULL)`);
  for (const tradeNumber of tradeNumbers) {
    const result = statement.run(tradeNumber, claim.id, claim.createdAt);
    if (result.changes !== 1) throw new CompensationOrderConflictError(tradeNumber);
  }
}

function completeClaim(input: Readonly<{
  database: DatabaseSync;
  id: string;
  reward: Readonly<{ code: string; id: number }> | null;
  updatedAt: string;
}>) {
  let completed: CompensationClaim | null = null;
  transaction(input.database, () => {
    updateCompletedClaim(input);
    if (input.reward) markOrdersRedeemed(input.database, input.id, input.updatedAt);
    completed = requiredClaim(input.database, input.id);
  });
  if (!completed) throw new Error("补偿发码记录完成失败");
  return completed;
}

function updateCompletedClaim(input: Parameters<typeof completeClaim>[0]) {
  const result = input.database.prepare(`UPDATE embed_compensation_claims
    SET status = 'completed', redemption_code = ?, reward_code_id = ?,
      error_message = NULL, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .run(input.reward?.code ?? null, input.reward?.id ?? null, input.updatedAt, input.id);
  if (result.changes !== 1) throw new Error("补偿发码记录状态已变化");
}

function markOrdersRedeemed(database: DatabaseSync, claimId: string, redeemedAt: string) {
  const result = database.prepare(`UPDATE embed_compensation_order_redemptions
    SET status = 'redeemed', redeemed_at = ? WHERE claim_id = ? AND status = 'reserved'`)
    .run(redeemedAt, claimId);
  if (result.changes < 1) throw new Error("补偿订单占用记录不存在");
}

function failClaim(input: Readonly<{
  database: DatabaseSync;
  id: string;
  message: string;
  updatedAt: string;
}>) {
  let failed: CompensationClaim | null = null;
  transaction(input.database, () => {
    const result = input.database.prepare(`UPDATE embed_compensation_claims
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`).run(input.message, input.updatedAt, input.id);
    if (result.changes !== 1) throw new Error("补偿发码记录状态已变化");
    input.database.prepare(`DELETE FROM embed_compensation_order_redemptions
      WHERE claim_id = ? AND status = 'reserved'`).run(input.id);
    failed = requiredClaim(input.database, input.id);
  });
  if (!failed) throw new Error("补偿发码记录失败状态保存失败");
  return failed;
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
    sub2apiEmail: row.sub2api_email,
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
  sub2api_email: string | null;
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

type RedemptionRow = Readonly<{
  claim_id: string;
  status: CompensationOrderRedemption["status"];
}>;
