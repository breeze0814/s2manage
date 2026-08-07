import type { DatabaseSync } from "node:sqlite";

export const TELEGRAM_SCHEMA_VERSION = 20;

const APP_SETTING_COLUMNS = [
  ["telegram_bot_token_enc", "TEXT NOT NULL DEFAULT ''"],
  ["telegram_chat_id", "TEXT NOT NULL DEFAULT ''"],
  ["telegram_hourly_balance_enabled", "INTEGER NOT NULL DEFAULT 0 CHECK (telegram_hourly_balance_enabled IN (0, 1))"],
  ["telegram_rate_change_enabled", "INTEGER NOT NULL DEFAULT 0 CHECK (telegram_rate_change_enabled IN (0, 1))"],
  ["notification_channels_enc", "TEXT NOT NULL DEFAULT ''"],
] as const;

const WORKER_RUN_COLUMNS = [
  ["sent_notifications", "INTEGER NOT NULL DEFAULT 0"],
  ["skipped_notifications", "INTEGER NOT NULL DEFAULT 0"],
  ["failed_notifications", "INTEGER NOT NULL DEFAULT 0"],
] as const;

export function ensureTelegramSchema(database: DatabaseSync) {
  ensureColumns(database, "app_settings", APP_SETTING_COLUMNS);
  ensureColumns(database, "worker_runs", WORKER_RUN_COLUMNS);
  database.exec(`CREATE TABLE IF NOT EXISTS telegram_notification_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_balance_push_at TEXT,
    last_rate_change_id INTEGER,
    updated_at TEXT NOT NULL
  ) STRICT`);
}

function ensureColumns(
  database: DatabaseSync,
  table: string,
  columns: readonly (readonly [string, string])[],
) {
  const existing = new Set((database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((column) => column.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}
