import type { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 6;

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    command_settings_json TEXT NOT NULL DEFAULT '{}',
    active_private_message_enabled INTEGER NOT NULL DEFAULT 1 CHECK (active_private_message_enabled IN (0, 1)),
    scheduled_stats_enabled INTEGER NOT NULL DEFAULT 1 CHECK (scheduled_stats_enabled IN (0, 1)),
    invite_activity_start_date TEXT NOT NULL DEFAULT '',
    invite_activity_active_reward_amount REAL,
    invite_activity_inactive_reward_amount REAL,
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
  `CREATE TABLE IF NOT EXISTS qq_bot_user_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qq_user_id TEXT NOT NULL UNIQUE,
    sub2_user_id INTEGER NOT NULL UNIQUE,
    sub2_email TEXT NOT NULL,
    sub2_snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS invite_reward_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start_date TEXT NOT NULL,
    period_end_date TEXT NOT NULL,
    inviter_id INTEGER NOT NULL,
    inviter_email TEXT NOT NULL,
    inviter_username TEXT NOT NULL,
    active_invitee_count INTEGER NOT NULL,
    inactive_invitee_count INTEGER NOT NULL,
    total_invitee_count INTEGER NOT NULL,
    reward_amount REAL NOT NULL,
    status TEXT NOT NULL,
    redeem_code_id INTEGER,
    redeem_code TEXT,
    error TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(period_start_date, inviter_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS runtime_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
];

export function initializeSqliteSchema(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  for (const statement of CREATE_TABLES) database.exec(statement);
  migrateBotSettings(database);
  migrateGroupRules(database);
  database.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(SCHEMA_VERSION));
}

function migrateBotSettings(database: DatabaseSync) {
  const columns = tableColumns(database, "bot_settings");
  addMissingColumn(database, columns, "bot_settings", "command_settings_json", "TEXT NOT NULL DEFAULT '{}'");
  addMissingColumn(database, columns, "bot_settings", "active_private_message_enabled", "INTEGER NOT NULL DEFAULT 1 CHECK (active_private_message_enabled IN (0, 1))");
  addMissingColumn(database, columns, "bot_settings", "scheduled_stats_enabled", "INTEGER NOT NULL DEFAULT 1 CHECK (scheduled_stats_enabled IN (0, 1))");
  addMissingColumn(database, columns, "bot_settings", "invite_activity_start_date", "TEXT NOT NULL DEFAULT ''");
  addMissingColumn(database, columns, "bot_settings", "invite_activity_active_reward_amount", "REAL");
  addMissingColumn(database, columns, "bot_settings", "invite_activity_inactive_reward_amount", "REAL");
}

function migrateGroupRules(database: DatabaseSync) {
  const columns = tableColumns(database, "group_rules");
  addMissingColumn(database, columns, "group_rules", "source_group_ids", "TEXT NOT NULL DEFAULT '[]'");
  addMissingColumn(database, columns, "group_rules", "formula", "TEXT NOT NULL DEFAULT 'avg'");
  addMissingColumn(database, columns, "group_rules", "multiplier", "REAL NOT NULL DEFAULT 1");
}

function addMissingColumn(database: DatabaseSync, columns: ReadonlySet<string>, tableName: string, name: string, definition: string) {
  if (!columns.has(name)) database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`);
}

function tableColumns(database: DatabaseSync, tableName: string) {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: unknown }>;
  return new Set(rows.map((row) => String(row.name)));
}
