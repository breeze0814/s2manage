import type { Pool } from "pg";
import { ensurePostgresLotterySchema } from "./postgres-lottery-schema.ts";
import { POSTGRES_CONNECTION_SCHEMA } from "./postgres-connection-schema.ts";
import { POSTGRES_CORE_SCHEMA } from "./postgres-core-schema.ts";
import { POSTGRES_EMBED_SCHEMA } from "./postgres-embed-schema.ts";

const APPLICATION_SCHEMA_VERSION = 2;
const APPLICATION_SCHEMA_LOCK = "s2a-rate-bot:application-schema";

export async function ensurePostgresSchema(pool: Pool) {
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
    if (version > APPLICATION_SCHEMA_VERSION) throw new Error("PostgreSQL application schema is newer than this application");
    if (version < 1) await client.query(`${POSTGRES_CORE_SCHEMA}${POSTGRES_CONNECTION_SCHEMA}${POSTGRES_EMBED_SCHEMA}`);
    if (version < 2) await client.query(`CREATE TABLE IF NOT EXISTS app_runtime_metadata (
      key text PRIMARY KEY, value text NOT NULL, updated_at text NOT NULL
    )`);
    await client.query(`INSERT INTO app_schema_migrations (name,version) VALUES ($1,$2)
      ON CONFLICT (name) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`,
    ["application", APPLICATION_SCHEMA_VERSION]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  await ensurePostgresLotterySchema(pool);
}
