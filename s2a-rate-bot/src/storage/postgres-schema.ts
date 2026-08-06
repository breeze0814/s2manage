import type { Pool, PoolClient } from "pg";
import { assertPostgresLotterySchema, migratePostgresLotterySchema } from "./postgres-lottery-schema.ts";
import { POSTGRES_CONNECTION_SCHEMA } from "./postgres-connection-schema.ts";
import { POSTGRES_CORE_SCHEMA } from "./postgres-core-schema.ts";
import { POSTGRES_EMBED_SCHEMA } from "./postgres-embed-schema.ts";
import { assertPostgresSchemaVersion } from "./postgres-schema-state.ts";

export const POSTGRES_APPLICATION_SCHEMA_VERSION = 4;
const APPLICATION_SCHEMA_LOCK = "s2a-rate-bot:application-schema";

export async function migratePostgresSchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [APPLICATION_SCHEMA_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name text PRIMARY KEY, version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    const result = await client.query<{ version: number }>(
      "SELECT version FROM app_schema_migrations WHERE name=$1 FOR UPDATE", ["application"],
    );
    const version = result.rows[0]?.version ?? 0;
    if (version > POSTGRES_APPLICATION_SCHEMA_VERSION) throw new Error("PostgreSQL application schema is newer than this application");
    if (version < 1) await client.query(`${POSTGRES_CORE_SCHEMA}${POSTGRES_CONNECTION_SCHEMA}${POSTGRES_EMBED_SCHEMA}`);
    if (version < 2) await client.query(`CREATE TABLE IF NOT EXISTS app_runtime_metadata (
      key text PRIMARY KEY, value text NOT NULL, updated_at text NOT NULL
    )`);
    if (version < 3) await client.query(`ALTER TABLE embed_compensation_settings
      ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'url'
      CHECK (order_source IN ('json','url'))`);
    if (version < 4) await migrateCompensationRedemptions(client);
    await client.query(`INSERT INTO app_schema_migrations (name,version) VALUES ($1,$2)
      ON CONFLICT (name) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`,
    ["application", POSTGRES_APPLICATION_SCHEMA_VERSION]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  await migratePostgresLotterySchema(pool);
}

export async function assertPostgresSchema(pool: Pool) {
  await assertPostgresSchemaVersion(pool, {
    name: "application",
    expectedVersion: POSTGRES_APPLICATION_SCHEMA_VERSION,
  });
  await assertPostgresLotterySchema(pool);
}

async function migrateCompensationRedemptions(client: Pick<PoolClient, "query">) {
  await client.query(`CREATE TABLE IF NOT EXISTS embed_compensation_order_redemptions (
    trade_no text PRIMARY KEY,
    claim_id text NOT NULL REFERENCES embed_compensation_claims(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('reserved','redeemed')),
    reserved_at text NOT NULL,
    redeemed_at text
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS embed_compensation_order_redemptions_claim
    ON embed_compensation_order_redemptions (claim_id)`);
  await client.query(`WITH historical AS (
    SELECT DISTINCT ON (item.value->>'requestedTradeNo') item.value->>'requestedTradeNo' AS trade_no,
      claim.id AS claim_id, claim.created_at AS reserved_at, claim.updated_at AS redeemed_at
    FROM embed_compensation_claims claim
    CROSS JOIN LATERAL jsonb_array_elements(claim.results_json::jsonb) AS item(value)
    WHERE claim.status='completed' AND claim.redemption_code IS NOT NULL
      AND item.value->>'status'='found' AND item.value->'compensation'->>'eligible'='true'
      AND (item.value->'compensation'->>'compensationFen')::numeric > 0
      AND COALESCE(item.value->>'requestedTradeNo','') <> ''
    ORDER BY item.value->>'requestedTradeNo',claim.updated_at,claim.id
  ) INSERT INTO embed_compensation_order_redemptions
    (trade_no,claim_id,status,reserved_at,redeemed_at)
    SELECT trade_no,claim_id,'redeemed',reserved_at,redeemed_at FROM historical
    ON CONFLICT (trade_no) DO NOTHING`);
}
