import type { DatabaseSync } from "node:sqlite";

const MINIMUM_PARAMETER_SCHEMA_VERSION = 9;
const LOCAL_SNAPSHOT_SCHEMA_VERSION = 10;
const SCHEMA_VERSION = LOCAL_SNAPSHOT_SCHEMA_VERSION;
const LEGACY_TABLES = [
  "source_rates", "source_accounts", "source_sites", "group_rules", "target_accounts",
  "target_groups", "worker_settings", "proxy_settings", "bot_settings", "target_settings",
] as const;

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
  `CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target_name TEXT NOT NULL,
    target_base_url TEXT NOT NULL,
    target_admin_key_enc TEXT NOT NULL,
    target_recharge_ratio REAL NOT NULL DEFAULT 1,
    proxy_enabled INTEGER NOT NULL CHECK (proxy_enabled IN (0, 1)),
    proxy_url TEXT NOT NULL,
    worker_interval_seconds INTEGER NOT NULL,
    worker_timeout_seconds INTEGER NOT NULL,
    worker_concurrency INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS collection_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    site_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_mode TEXT NOT NULL,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    recharge_ratio REAL NOT NULL,
    interval_seconds INTEGER NOT NULL,
    use_proxy INTEGER NOT NULL CHECK (use_proxy IN (0, 1)),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    account_label TEXT,
    balance REAL,
    last_run_at TEXT,
    last_success_at TEXT,
    last_status TEXT,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    group_count INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    FOREIGN KEY (site_id) REFERENCES collection_sites(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS collection_group_rates (
    site_id INTEGER NOT NULL,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    platform TEXT,
    raw_rate REAL,
    effective_rate REAL NOT NULL,
    collected_at TEXT NOT NULL,
    PRIMARY KEY (site_id, group_id),
    FOREIGN KEY (site_id) REFERENCES collection_sites(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_account_snapshots (
    account_id INTEGER PRIMARY KEY,
    account_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    schedulable INTEGER NOT NULL CHECK (schedulable IN (0, 1)),
    rate_multiplier REAL,
    priority INTEGER,
    group_ids_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_group_snapshots (
    group_id INTEGER PRIMARY KEY,
    group_name TEXT NOT NULL,
    platform TEXT,
    status TEXT,
    rate_multiplier REAL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_group_rules (
    group_id INTEGER PRIMARY KEY,
    group_name TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    rule_version INTEGER NOT NULL,
    rule_type TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    current_rate REAL,
    last_applied_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS target_group_bindings (
    group_id INTEGER NOT NULL,
    source_site_id INTEGER NOT NULL,
    source_group_id TEXT NOT NULL,
    PRIMARY KEY (group_id, source_site_id, source_group_id),
    FOREIGN KEY (group_id) REFERENCES target_group_rules(group_id) ON DELETE CASCADE,
    FOREIGN KEY (source_site_id) REFERENCES collection_sites(id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS worker_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    collected_sources INTEGER NOT NULL,
    skipped_sources INTEGER NOT NULL,
    failed_sources INTEGER NOT NULL,
    applied_groups INTEGER NOT NULL,
    skipped_groups INTEGER NOT NULL,
    failed_groups INTEGER NOT NULL,
    errors_json TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
  ) STRICT`,
];

export function initializeSqliteSchema(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(CREATE_TABLES[0]);
  const previousVersion = schemaVersion(database);
  if (previousVersion < SCHEMA_VERSION) dropLegacyTables(database);
  for (const statement of CREATE_TABLES.slice(1)) database.exec(statement);
  migrateSchema(database, previousVersion);
  database.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(SCHEMA_VERSION));
}

function migrateSchema(database: DatabaseSync, previousVersion: number) {
  ensureTargetRechargeRatio(database);
  ensureTargetGroupPlatform(database);
  if (previousVersion < MINIMUM_PARAMETER_SCHEMA_VERSION) {
    database.exec(`UPDATE target_group_rules
      SET parameters_json = json_set(parameters_json, '$.minimum', 0)
      WHERE json_type(parameters_json, '$.minimum') IS NULL`);
  }
  if (previousVersion < LOCAL_SNAPSHOT_SCHEMA_VERSION) seedGroupSnapshots(database);
}

function ensureTargetRechargeRatio(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(app_settings)").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "target_recharge_ratio")) return;
  database.exec("ALTER TABLE app_settings ADD COLUMN target_recharge_ratio REAL NOT NULL DEFAULT 1");
}

function ensureTargetGroupPlatform(database: DatabaseSync) {
  const columns = database.prepare("PRAGMA table_info(target_group_snapshots)").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "platform")) return;
  database.exec("ALTER TABLE target_group_snapshots ADD COLUMN platform TEXT");
}

function seedGroupSnapshots(database: DatabaseSync) {
  database.exec(`INSERT OR IGNORE INTO target_group_snapshots
    (group_id, group_name, status, rate_multiplier, updated_at)
    SELECT group_id, group_name, NULL, current_rate, updated_at FROM target_group_rules`);
}

function schemaVersion(database: DatabaseSync) {
  const row = database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value: unknown } | undefined;
  if (!row) return 0;
  const version = Number(row.value);
  if (!Number.isInteger(version) || version < 0) throw new Error(`Invalid SQLite schema version: ${String(row.value)}`);
  return version;
}

function dropLegacyTables(database: DatabaseSync) {
  for (const table of LEGACY_TABLES) database.exec(`DROP TABLE IF EXISTS ${table}`);
}
