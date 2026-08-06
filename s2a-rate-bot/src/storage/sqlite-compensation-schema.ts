import type { DatabaseSync } from "node:sqlite";

export function ensureSqliteCompensationSchema(database: DatabaseSync) {
  for (const statement of COMPENSATION_TABLES) database.exec(statement);
  ensureSettingsOrderSource(database);
  backfillOrderRedemptions(database);
}

const COMPENSATION_TABLES = [
  `CREATE TABLE IF NOT EXISTS embed_compensation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    activity_name TEXT NOT NULL,
    description TEXT NOT NULL,
    order_source TEXT NOT NULL DEFAULT 'url' CHECK (order_source IN ('json', 'url')),
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS embed_compensation_claims (
    id TEXT PRIMARY KEY,
    src_host TEXT NOT NULL,
    sub2api_user_id TEXT NOT NULL,
    masked_email TEXT NOT NULL,
    store_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    results_json TEXT NOT NULL CHECK (json_valid(results_json)),
    eligible_order_count INTEGER NOT NULL,
    invalid_order_count INTEGER NOT NULL,
    total_compensation_fen INTEGER NOT NULL,
    redemption_code TEXT,
    reward_code_id INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_compensation_claims_recent
    ON embed_compensation_claims (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS embed_compensation_order_redemptions (
    trade_no TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'redeemed')),
    reserved_at TEXT NOT NULL,
    redeemed_at TEXT,
    FOREIGN KEY (claim_id) REFERENCES embed_compensation_claims(id) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS embed_compensation_order_redemptions_claim
    ON embed_compensation_order_redemptions (claim_id)`,
] as const;

function ensureSettingsOrderSource(database: DatabaseSync) {
  const names = tableColumns(database, "embed_compensation_settings");
  if (names.has("order_source")) return;
  database.exec(`ALTER TABLE embed_compensation_settings ADD COLUMN order_source
    TEXT NOT NULL DEFAULT 'url' CHECK (order_source IN ('json', 'url'))`);
}

function backfillOrderRedemptions(database: DatabaseSync) {
  database.exec(`INSERT OR IGNORE INTO embed_compensation_order_redemptions
    (trade_no, claim_id, status, reserved_at, redeemed_at)
    SELECT json_extract(item.value, '$.requestedTradeNo'), claim.id, 'redeemed',
      claim.created_at, claim.updated_at
    FROM embed_compensation_claims claim, json_each(claim.results_json) item
    WHERE claim.status = 'completed' AND claim.redemption_code IS NOT NULL
      AND json_extract(item.value, '$.status') = 'found'
      AND json_extract(item.value, '$.compensation.eligible') = 1
      AND json_extract(item.value, '$.compensation.compensationFen') > 0
      AND COALESCE(json_extract(item.value, '$.requestedTradeNo'), '') <> ''
    ORDER BY claim.updated_at, claim.id`);
}

function tableColumns(database: DatabaseSync, table: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
}
