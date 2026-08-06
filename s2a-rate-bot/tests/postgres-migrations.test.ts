import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  assertPostgresSchema,
  migratePostgresSchema,
  POSTGRES_APPLICATION_SCHEMA_VERSION,
} from "../src/storage/postgres-schema.ts";
import { POSTGRES_LOTTERY_SCHEMA_VERSION } from "../src/storage/postgres-lottery-schema.ts";

test("PostgreSQL migration owns and advances every s2a-rate-bot schema", async () => {
  const database = testDatabase({ tableExists: false });
  await migratePostgresSchema(database.pool);

  assert.equal(database.versions.get("application"), POSTGRES_APPLICATION_SCHEMA_VERSION);
  assert.equal(database.versions.get("lottery"), POSTGRES_LOTTERY_SCHEMA_VERSION);
  assert.ok(database.statements.some((sql) => sql.includes("embed_compensation_order_redemptions")));
  assert.ok(database.statements.some((sql) => sql.includes("CREATE TABLE lottery_campaigns")));
});

test("PostgreSQL schema check is read-only and accepts current versions", async () => {
  const database = currentDatabase();
  await assertPostgresSchema(database.pool);
  assert.equal(database.statements.some((sql) => /CREATE|ALTER|INSERT/.test(sql)), false);
});

test("PostgreSQL schema check rejects missing and outdated databases", async () => {
  await assert.rejects(
    assertPostgresSchema(testDatabase({ tableExists: false }).pool),
    /schema is not initialized; run npm run db:migrate/,
  );
  await assert.rejects(
    assertPostgresSchema(testDatabase({ versions: { application: 3, lottery: 2 } }).pool),
    /application schema is outdated; run npm run db:migrate/,
  );
  await assert.rejects(
    assertPostgresSchema(testDatabase({ versions: { application: 4 } }).pool),
    /lottery schema is not initialized; run npm run db:migrate/,
  );
});

type TestDatabaseOptions = Readonly<{
  tableExists?: boolean;
  versions?: Readonly<Record<string, number>>;
}>;

function currentDatabase() {
  return testDatabase({ versions: {
    application: POSTGRES_APPLICATION_SCHEMA_VERSION,
    lottery: POSTGRES_LOTTERY_SCHEMA_VERSION,
  } });
}

function testDatabase(options: TestDatabaseOptions = {}) {
  let tableExists = options.tableExists ?? true;
  const versions = new Map(Object.entries(options.versions ?? {}));
  const statements: string[] = [];
  const query = async (sql: string, values: readonly unknown[] = []) => {
    statements.push(sql);
    if (sql.includes("CREATE TABLE IF NOT EXISTS app_schema_migrations")) tableExists = true;
    if (sql.includes("to_regclass")) return result([{ name: tableExists ? "app_schema_migrations" : null }]);
    if (sql.includes("SELECT version FROM app_schema_migrations")) {
      const version = versions.get(String(values[0]));
      return result(version === undefined ? [] : [{ version }]);
    }
    if (sql.includes("INSERT INTO app_schema_migrations")) {
      versions.set(String(values[0]), Number(values[1]));
    }
    return result([]);
  };
  const client = { query, release: () => undefined } as unknown as PoolClient;
  const pool = { query, connect: async () => client } as unknown as Pool;
  return { pool, statements, versions };
}

function result(rows: readonly Record<string, unknown>[]) {
  return { rows, rowCount: rows.length };
}
