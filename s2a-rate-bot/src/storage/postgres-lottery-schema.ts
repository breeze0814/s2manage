import type { Pool } from "pg";
import { assertPostgresSchemaVersion } from "./postgres-schema-state.ts";

export const POSTGRES_LOTTERY_SCHEMA_VERSION = 2;
const LOTTERY_SCHEMA_LOCK = "s2a-rate-bot:lottery-schema";

const MIGRATION_V1 = `
CREATE TABLE lottery_campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  draw_mode text NOT NULL CHECK (draw_mode IN ('instant', 'scheduled')),
  participation_mode text NOT NULL CHECK (participation_mode IN ('daily', 'once')),
  status text NOT NULL CHECK (status IN ('scheduled', 'open', 'closed', 'drawing', 'drawn', 'exhausted', 'cancelled')),
  registration_start timestamptz,
  registration_end timestamptz,
  draw_at timestamptz,
  visible_to_users boolean NOT NULL,
  eligibility_json jsonb NOT NULL,
  public_winners boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  drawn_at timestamptz,
  last_error text
);

CREATE TABLE lottery_prizes (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES lottery_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('balance', 'subscription')),
  value double precision NOT NULL CHECK (value > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  remaining_quantity integer NOT NULL CHECK (remaining_quantity >= 0),
  probability_ppm integer CHECK (probability_ppm IS NULL OR probability_ppm BETWEEN 1 AND 1000000),
  sort_order integer NOT NULL,
  UNIQUE (campaign_id, id)
);

CREATE TABLE lottery_entries (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES lottery_campaigns(id) ON DELETE CASCADE,
  participation_key text NOT NULL,
  sub2api_user_id text NOT NULL,
  masked_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('entered', 'won', 'not_won', 'withdrawn')),
  prize_id text REFERENCES lottery_prizes(id),
  prize_name text,
  prize_type text CHECK (prize_type IN ('balance', 'subscription')),
  prize_value double precision,
  redemption_code text,
  reward_code_id bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (campaign_id, sub2api_user_id, participation_key)
);

CREATE TABLE lottery_reward_jobs (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES lottery_campaigns(id) ON DELETE CASCADE,
  entry_id text NOT NULL UNIQUE REFERENCES lottery_entries(id) ON DELETE CASCADE,
  prize_id text NOT NULL REFERENCES lottery_prizes(id),
  type text NOT NULL CHECK (type IN ('balance', 'subscription')),
  value double precision NOT NULL CHECK (value > 0),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'fulfilled', 'retryable_failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  fulfilled_at timestamptz
);

CREATE INDEX lottery_campaigns_due ON lottery_campaigns (status, draw_mode, draw_at);
CREATE INDEX lottery_entries_campaign ON lottery_entries (campaign_id, status, created_at, id);
CREATE UNIQUE INDEX lottery_entries_one_win_per_user ON lottery_entries (campaign_id, sub2api_user_id) WHERE status = 'won';
CREATE INDEX lottery_reward_jobs_claim ON lottery_reward_jobs (status, next_attempt_at, locked_at);
`;

const MIGRATION_V2 = `
ALTER TABLE lottery_reward_jobs ADD COLUMN IF NOT EXISTS lock_token text;
`;

export async function migratePostgresLotterySchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOTTERY_SCHEMA_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name text PRIMARY KEY, version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    const result = await client.query<{ version: number }>(
      "SELECT version FROM app_schema_migrations WHERE name = $1 FOR UPDATE",
      ["lottery"],
    );
    const version = result.rows[0]?.version ?? 0;
    if (version > POSTGRES_LOTTERY_SCHEMA_VERSION) throw new Error("PostgreSQL lottery schema is newer than this application");
    if (version < 1) await client.query(MIGRATION_V1);
    if (version < 2) await client.query(MIGRATION_V2);
    await client.query(`INSERT INTO app_schema_migrations (name, version) VALUES ($1, $2)
      ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, updated_at = now()`,
    ["lottery", POSTGRES_LOTTERY_SCHEMA_VERSION]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assertPostgresLotterySchema(pool: Pool) {
  await assertPostgresSchemaVersion(pool, {
    name: "lottery",
    expectedVersion: POSTGRES_LOTTERY_SCHEMA_VERSION,
  });
}
