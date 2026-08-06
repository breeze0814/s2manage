import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { createPostgresPool } from "../src/server/infrastructure/postgres.ts";
import { ensurePostgresSchema } from "../src/storage/postgres-schema.ts";
import { sqlitePath } from "../src/storage/sqlite-utils.ts";
import { initializeSqliteSchema } from "../src/storage/sqlite-schema.ts";
import { importCommonTables } from "./sqlite-import-common.ts";
import { importLegacyLottery } from "./sqlite-import-lottery.ts";

const sqliteUrl = required("SQLITE_MIGRATION_URL", process.env.SQLITE_MIGRATION_URL);
const postgresUrl = required("POSTGRES_URL", process.env.POSTGRES_URL);
const path = sqlitePath(sqliteUrl);
if (!existsSync(path)) throw new Error(`SQLite migration source does not exist: ${path}`);
const database = new DatabaseSync(path);
const pool = createPostgresPool(postgresUrl);

try {
  initializeSqliteSchema(database);
  await ensurePostgresSchema(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const common = await importCommonTables(database, client);
    const lottery = await importLegacyLottery(database, client);
    await client.query("COMMIT");
    const commonRows = Object.values(common).reduce((total, count) => total + count, 0);
    console.log(`SQLite migration completed: commonRows=${commonRows}, lotteryCampaigns=${lottery.campaigns}, lotteryEntries=${lottery.entries}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
} finally {
  database.close();
  await pool.end();
}

function required(name: string, value: string | undefined) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}
