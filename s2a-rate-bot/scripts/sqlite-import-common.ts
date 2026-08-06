import type { DatabaseSync } from "node:sqlite";
import type { PoolClient } from "pg";

const COMMON_TABLES = [
  "admin_users", "app_settings", "collection_sites", "collection_runs", "collection_group_rates",
  "collection_group_platform_overrides", "collection_group_metadata", "collection_rate_changes",
  "target_account_snapshots", "target_account_bindings", "target_account_test_results",
  "target_group_snapshots", "target_group_rules", "target_group_bindings", "worker_runs",
  "telegram_notification_state", "real_connections", "connection_lifecycle_events",
  "connection_health_policies", "connection_health_assignments", "connection_health_states",
  "connection_health_events", "connection_health_action_states", "embed_configs", "embed_tickets",
  "embed_ticket_messages", "embed_ticket_attachments", "embed_compensation_settings",
  "embed_compensation_claims", "embed_compensation_order_redemptions",
] as const;

const SERIAL_TABLES = [
  "collection_sites", "collection_runs", "collection_rate_changes", "worker_runs",
  "connection_lifecycle_events", "connection_health_policies", "connection_health_events",
] as const;

export async function importCommonTables(database: DatabaseSync, client: PoolClient) {
  const counts: Record<string, number> = {};
  for (const table of COMMON_TABLES) counts[table] = await importTable(database, client, table);
  for (const table of SERIAL_TABLES) await resetSequence(client, table);
  return counts;
}

async function importTable(database: DatabaseSync, client: PoolClient, table: string) {
  if (!sqliteTableExists(database, table)) return 0;
  const sourceColumns = sqliteColumns(database, table);
  const targetColumns = await postgresColumns(client, table);
  const columns = targetColumns.filter((column) => sourceColumns.has(column));
  if (!columns.length) throw new Error(`迁移表没有可复制列: ${table}`);
  const keys = await primaryKeys(client, table);
  if (!keys.length || keys.some((key) => !columns.includes(key))) throw new Error(`迁移表主键无效: ${table}`);
  const values = database.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  const sql = upsertSql(table, columns, keys);
  for (const value of values) await client.query(sql, columns.map((column) => pgValue(value[column])));
  return values.length;
}

function upsertSql(table: string, columns: readonly string[], keys: readonly string[]) {
  const names = columns.join(",");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
  const mutable = columns.filter((column) => !keys.includes(column));
  const conflict = mutable.length
    ? `DO UPDATE SET ${mutable.map((column) => `${column}=EXCLUDED.${column}`).join(",")}`
    : "DO NOTHING";
  return `INSERT INTO ${table} (${names}) VALUES (${placeholders}) ON CONFLICT (${keys.join(",")}) ${conflict}`;
}

function sqliteTableExists(database: DatabaseSync, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function sqliteColumns(database: DatabaseSync, table: string) {
  const values = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(values.map((value) => value.name));
}

async function postgresColumns(client: PoolClient, table: string) {
  const result = await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  if (!result.rowCount) throw new Error(`PostgreSQL 目标表不存在: ${table}`);
  return result.rows.map((value) => value.column_name);
}

async function primaryKeys(client: PoolClient, table: string) {
  const result = await client.query<{ column_name: string }>(`SELECT kcu.column_name
    FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
    WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
    ORDER BY kcu.ordinal_position`, [table]);
  return result.rows.map((value) => value.column_name);
}

async function resetSequence(client: PoolClient, table: string) {
  const sequence = await client.query<{ name: string | null }>("SELECT pg_get_serial_sequence($1,'id') AS name", [table]);
  const name = sequence.rows[0]?.name;
  if (!name) return;
  const maximum = await client.query<{ maximum: number | null; present: boolean }>(
    `SELECT MAX(id) AS maximum,COUNT(*)>0 AS present FROM ${table}`);
  const value = maximum.rows[0];
  await client.query("SELECT setval($1::regclass,$2,$3)", [name, value?.maximum ?? 1, value?.present ?? false]);
}

function pgValue(value: unknown) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}
