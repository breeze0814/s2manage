import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { SettingsStore, StoredSettings } from "./store.ts";

type SettingsRow = Record<string, unknown>;

export function createPostgresSettingsStore(context: PostgresContext): SettingsStore {
  return {
    get: async () => mapSettings(await row<SettingsRow>(context, "SELECT * FROM app_settings WHERE id=1")),
    save: (settings) => saveSettings(context, settings),
    close: async () => undefined,
  };
}

async function saveSettings(context: PostgresContext, settings: StoredSettings) {
  await execute(context, `INSERT INTO app_settings (id,target_name,target_base_url,target_admin_key_enc,
    target_recharge_ratio,proxy_enabled,proxy_url,worker_interval_seconds,worker_timeout_seconds,
    worker_concurrency,telegram_bot_token_enc,telegram_chat_id,telegram_hourly_balance_enabled,
    telegram_rate_change_enabled,updated_at) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(id) DO UPDATE SET target_name=EXCLUDED.target_name,target_base_url=EXCLUDED.target_base_url,
    target_admin_key_enc=EXCLUDED.target_admin_key_enc,target_recharge_ratio=EXCLUDED.target_recharge_ratio,
    proxy_enabled=EXCLUDED.proxy_enabled,proxy_url=EXCLUDED.proxy_url,
    worker_interval_seconds=EXCLUDED.worker_interval_seconds,worker_timeout_seconds=EXCLUDED.worker_timeout_seconds,
    worker_concurrency=EXCLUDED.worker_concurrency,telegram_bot_token_enc=EXCLUDED.telegram_bot_token_enc,
    telegram_chat_id=EXCLUDED.telegram_chat_id,
    telegram_hourly_balance_enabled=EXCLUDED.telegram_hourly_balance_enabled,
    telegram_rate_change_enabled=EXCLUDED.telegram_rate_change_enabled,updated_at=EXCLUDED.updated_at`, [
    settings.targetName, settings.targetBaseUrl, settings.targetAdminKeyEnc, settings.targetRechargeRatio,
    flag(settings.proxyEnabled), settings.proxyUrl, settings.workerIntervalSeconds,
    settings.workerTimeoutSeconds, settings.workerConcurrency, settings.telegramBotTokenEnc,
    settings.telegramChatId, flag(settings.telegramHourlyBalanceEnabled),
    flag(settings.telegramRateChangeEnabled), new Date().toISOString(),
  ]);
}

function mapSettings(value: SettingsRow | null): StoredSettings | null {
  if (!value) return null;
  return {
    targetName: String(value.target_name), targetBaseUrl: String(value.target_base_url),
    targetAdminKeyEnc: String(value.target_admin_key_enc), targetRechargeRatio: Number(value.target_recharge_ratio),
    proxyEnabled: Number(value.proxy_enabled) === 1, proxyUrl: String(value.proxy_url),
    workerIntervalSeconds: Number(value.worker_interval_seconds),
    workerTimeoutSeconds: Number(value.worker_timeout_seconds), workerConcurrency: Number(value.worker_concurrency),
    telegramBotTokenEnc: String(value.telegram_bot_token_enc), telegramChatId: String(value.telegram_chat_id),
    telegramHourlyBalanceEnabled: Number(value.telegram_hourly_balance_enabled) === 1,
    telegramRateChangeEnabled: Number(value.telegram_rate_change_enabled) === 1,
  };
}

function flag(value: boolean) { return value ? 1 : 0; }
