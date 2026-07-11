import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, flag, nowIso, sqlitePath } from "../../storage/sqlite-utils.ts";

export type StoredSettings = {
  readonly targetName: string;
  readonly targetBaseUrl: string;
  readonly targetAdminKeyEnc: string;
  readonly targetRechargeRatio: number;
  readonly proxyEnabled: boolean;
  readonly proxyUrl: string;
  readonly workerIntervalSeconds: number;
  readonly workerTimeoutSeconds: number;
  readonly workerConcurrency: number;
};

export type SettingsStore = {
  readonly get: () => StoredSettings | null;
  readonly save: (settings: StoredSettings) => void;
  readonly close: () => void;
};

export function createSqliteSettingsStore(databaseUrl: string): SettingsStore {
  const databasePath = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(databasePath);
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return { get: () => readSettings(database), save: (settings) => saveSettings(database, settings), close: () => database.close() };
}

function readSettings(database: DatabaseSync): StoredSettings | null {
  const row = database.prepare("SELECT * FROM app_settings WHERE id = 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    targetName: String(row.target_name),
    targetBaseUrl: String(row.target_base_url),
    targetAdminKeyEnc: String(row.target_admin_key_enc),
    targetRechargeRatio: Number(row.target_recharge_ratio),
    proxyEnabled: Number(row.proxy_enabled) === 1,
    proxyUrl: String(row.proxy_url),
    workerIntervalSeconds: Number(row.worker_interval_seconds),
    workerTimeoutSeconds: Number(row.worker_timeout_seconds),
    workerConcurrency: Number(row.worker_concurrency),
  };
}

function saveSettings(database: DatabaseSync, settings: StoredSettings) {
  database.prepare(`
    INSERT INTO app_settings (id, target_name, target_base_url, target_admin_key_enc,
      target_recharge_ratio, proxy_enabled, proxy_url, worker_interval_seconds,
      worker_timeout_seconds, worker_concurrency, updated_at)
    VALUES (1, :targetName, :targetBaseUrl, :targetAdminKeyEnc, :targetRechargeRatio,
      :proxyEnabled, :proxyUrl, :workerIntervalSeconds, :workerTimeoutSeconds,
      :workerConcurrency, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET target_name = excluded.target_name,
      target_base_url = excluded.target_base_url, target_admin_key_enc = excluded.target_admin_key_enc,
      target_recharge_ratio = excluded.target_recharge_ratio,
      proxy_enabled = excluded.proxy_enabled, proxy_url = excluded.proxy_url,
      worker_interval_seconds = excluded.worker_interval_seconds,
      worker_timeout_seconds = excluded.worker_timeout_seconds,
      worker_concurrency = excluded.worker_concurrency, updated_at = excluded.updated_at
  `).run({ ...settings, proxyEnabled: flag(settings.proxyEnabled), updatedAt: nowIso() });
}
