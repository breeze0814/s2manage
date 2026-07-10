import type { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 3;

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    admin_api_key TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS bot_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    ws_url TEXT NOT NULL,
    token TEXT NOT NULL,
    target_group_id TEXT NOT NULL,
    mention_command_enabled INTEGER NOT NULL CHECK (mention_command_enabled IN (0, 1)),
    bot_user_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS proxy_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    http_proxy TEXT NOT NULL,
    https_proxy TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS worker_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    interval_seconds INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    rate_multiplier REAL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    schedulable INTEGER NOT NULL CHECK (schedulable IN (0, 1)),
    rate_multiplier REAL,
    priority INTEGER,
    group_ids TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS group_rules (
    target_group_id INTEGER PRIMARY KEY,
    target_group_name TEXT NOT NULL,
    current_rate REAL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    mode TEXT NOT NULL,
    offset REAL NOT NULL,
    source_group_id TEXT NOT NULL,
    source_group_ids TEXT NOT NULL DEFAULT '[]',
    formula TEXT NOT NULL DEFAULT 'avg',
    multiplier REAL NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS source_sites (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    site_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_mode TEXT NOT NULL,
    access_token TEXT NOT NULL,
    rt_token TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    recharge_ratio REAL NOT NULL,
    interval_seconds INTEGER NOT NULL,
    use_proxy INTEGER NOT NULL CHECK (use_proxy IN (0, 1)),
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS source_accounts (
    source_site_id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    balance REAL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS source_rates (
    source_site_id INTEGER NOT NULL,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    platform TEXT,
    raw_rate REAL,
    effective_rate REAL NOT NULL,
    collected_at TEXT NOT NULL,
    PRIMARY KEY (source_site_id, group_id),
    FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE CASCADE
  ) STRICT`,
];

export function initializeSqliteSchema(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  for (const statement of CREATE_TABLES) database.exec(statement);
  migrateGroupRules(database);
  database.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(SCHEMA_VERSION));
}

function migrateGroupRules(database: DatabaseSync) {
  const columns = tableColumns(database, "group_rules");
  addMissingColumn(database, columns, "source_group_ids", "TEXT NOT NULL DEFAULT '[]'");
  addMissingColumn(database, columns, "formula", "TEXT NOT NULL DEFAULT 'avg'");
  addMissingColumn(database, columns, "multiplier", "REAL NOT NULL DEFAULT 1");
}

function addMissingColumn(database: DatabaseSync, columns: ReadonlySet<string>, name: string, definition: string) {
  if (!columns.has(name)) database.exec(`ALTER TABLE group_rules ADD COLUMN ${name} ${definition}`);
}

function tableColumns(database: DatabaseSync, tableName: string) {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: unknown }>;
  return new Set(rows.map((row) => String(row.name)));
}
