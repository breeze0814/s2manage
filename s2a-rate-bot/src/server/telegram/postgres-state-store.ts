import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { TelegramNotificationState, TelegramStateStore } from "./state-store.ts";

type StateRow = { last_balance_push_at: string | null; last_rate_change_id: number | null };

export function createPostgresTelegramStateStore(context: PostgresContext): TelegramStateStore {
  return {
    get: async () => mapState(await row<StateRow>(context,
      "SELECT last_balance_push_at,last_rate_change_id FROM telegram_notification_state WHERE id=1")),
    markBalancePushed: (value) => updateState(context, "last_balance_push_at", value),
    markRateChangesPushed: (value) => updateState(context, "last_rate_change_id", value),
    close: async () => undefined,
  };
}

function mapState(value: StateRow | null): TelegramNotificationState {
  return { lastBalancePushAt: value?.last_balance_push_at ?? null,
    lastRateChangeId: value?.last_rate_change_id ?? null };
}

async function updateState(
  context: PostgresContext,
  column: "last_balance_push_at" | "last_rate_change_id",
  value: string | number,
) {
  await execute(context, `INSERT INTO telegram_notification_state (id,${column},updated_at)
    VALUES (1,$1,$2) ON CONFLICT(id) DO UPDATE SET ${column}=EXCLUDED.${column},updated_at=EXCLUDED.updated_at`,
  [value, new Date().toISOString()]);
}
