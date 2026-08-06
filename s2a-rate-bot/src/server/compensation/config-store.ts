import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { CompensationRule } from "../../core/compensation.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type StoredCompensationSettings = Readonly<{
  enabled: boolean;
  activityName: string;
  description: string;
  orderSource: "json" | "url";
  baseUrl: string;
  username: string;
  passwordEnc: string;
  rules: readonly CompensationRule[];
  updatedAt: string;
}>;

export type CompensationConfigStore = Readonly<{
  get: () => Awaitable<StoredCompensationSettings | null>;
  save: (settings: Omit<StoredCompensationSettings, "updatedAt">) => Awaitable<StoredCompensationSettings>;
  close: () => Awaitable<void>;
}>;

export function createSqliteCompensationConfigStore(databaseUrl: string): CompensationConfigStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    get: () => readSettings(database),
    save: (settings) => saveSettings(database, settings),
    close: () => database.close(),
  };
}

function readSettings(database: DatabaseSync): StoredCompensationSettings | null {
  const row = database.prepare("SELECT * FROM embed_compensation_settings WHERE id = 1")
    .get() as SettingsRow | undefined;
  if (!row) return null;
  return {
    enabled: row.enabled === 1,
    activityName: row.activity_name,
    description: row.description,
    orderSource: row.order_source,
    baseUrl: row.base_url,
    username: row.username,
    passwordEnc: row.password_enc,
    rules: parseRules(row.rules_json),
    updatedAt: row.updated_at,
  };
}

function saveSettings(
  database: DatabaseSync,
  settings: Omit<StoredCompensationSettings, "updatedAt">,
) {
  const updatedAt = nowIso();
  database.prepare(`INSERT INTO embed_compensation_settings
    (id, enabled, activity_name, description, order_source, base_url, username, password_enc, rules_json, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled,
      activity_name = excluded.activity_name, description = excluded.description,
      order_source = excluded.order_source, base_url = excluded.base_url, username = excluded.username,
      password_enc = excluded.password_enc, rules_json = excluded.rules_json,
      updated_at = excluded.updated_at`)
    .run(flag(settings.enabled), settings.activityName, settings.description, settings.orderSource, settings.baseUrl,
      settings.username, settings.passwordEnc, JSON.stringify(settings.rules), updatedAt);
  return requiredSettings(database);
}

function requiredSettings(database: DatabaseSync) {
  const settings = readSettings(database);
  if (!settings) throw new Error("补偿活动配置保存失败");
  return settings;
}

function parseRules(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("补偿活动规则 JSON 无效");
  return parsed as readonly CompensationRule[];
}

type SettingsRow = Readonly<{
  enabled: number;
  activity_name: string;
  description: string;
  order_source: "json" | "url";
  base_url: string;
  username: string;
  password_enc: string;
  rules_json: string;
  updated_at: string;
}>;
