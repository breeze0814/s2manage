import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, nowIso, sqlitePath } from "../../storage/sqlite-utils.ts";

export type TelegramNotificationState = {
  readonly lastBalancePushAt: string | null;
  readonly lastRateChangeId: number | null;
};

export type TelegramStateStore = {
  readonly get: () => TelegramNotificationState;
  readonly markBalancePushed: (timestamp: string) => void;
  readonly markRateChangesPushed: (changeId: number) => void;
  readonly close: () => void;
};

export function createSqliteTelegramStateStore(databaseUrl: string): TelegramStateStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return {
    get: () => readState(database),
    markBalancePushed: (timestamp) => updateState(database, "last_balance_push_at", timestamp),
    markRateChangesPushed: (changeId) => updateState(database, "last_rate_change_id", changeId),
    close: () => database.close(),
  };
}

function readState(database: DatabaseSync): TelegramNotificationState {
  const row = database.prepare("SELECT * FROM telegram_notification_state WHERE id = 1").get() as Record<string, unknown> | undefined;
  return {
    lastBalancePushAt: row?.last_balance_push_at == null ? null : String(row.last_balance_push_at),
    lastRateChangeId: row?.last_rate_change_id == null ? null : Number(row.last_rate_change_id),
  };
}

function updateState(database: DatabaseSync, column: "last_balance_push_at" | "last_rate_change_id", value: string | number) {
  database.prepare(`INSERT INTO telegram_notification_state (id, ${column}, updated_at)
    VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET ${column}=excluded.${column}, updated_at=excluded.updated_at`)
    .run(value, nowIso());
}
