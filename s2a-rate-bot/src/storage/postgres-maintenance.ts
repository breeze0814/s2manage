import type { PostgresContext } from "../server/infrastructure/postgres-context.ts";
import { postgresTransaction } from "../server/infrastructure/postgres-context.ts";

const CLEANUP_META_KEY = "database_cleanup_at";
const DEFAULT_INTERVAL_HOURS = 1;
const DEFAULT_RETENTION_DAYS = 2;
const DEFAULT_EVENT_RETENTION_DAYS = 30;
const HOURS_TO_MS = 60 * 60 * 1_000;
const DAYS_TO_MS = 24 * HOURS_TO_MS;

export type PostgresMaintenance = {
  readonly runIfDue: (now?: Date) => Promise<DatabaseCleanupResult | null>;
  readonly close: () => Promise<void>;
};

export type DatabaseCleanupResult = {
  readonly collectionRuns: number;
  readonly workerRuns: number;
  readonly accountTestResults: number;
  readonly healthEvents: number;
  readonly lifecycleEvents: number;
  readonly cutoff: string;
  readonly eventCutoff: string;
};

export function createPostgresMaintenance(context: PostgresContext, options: Readonly<{
  intervalHours?: number; retentionDays?: number; eventRetentionDays?: number;
}> = {}): PostgresMaintenance {
  const intervalHours = options.intervalHours ?? DEFAULT_INTERVAL_HOURS;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const eventRetentionDays = options.eventRetentionDays ?? DEFAULT_EVENT_RETENTION_DAYS;
  validateOptions(intervalHours, retentionDays, eventRetentionDays);
  return { runIfDue: (now = new Date()) => runIfDue(context, { now, intervalHours, retentionDays, eventRetentionDays }), close: async () => undefined };
}

async function runIfDue(context: PostgresContext, input: Readonly<{
  now: Date; intervalHours: number; retentionDays: number; eventRetentionDays: number;
}>) {
  await context.ready;
  return postgresTransaction(context, async (client) => {
    const metadata = await client.query<{ value: string }>(
      "SELECT value FROM app_runtime_metadata WHERE key=$1 FOR UPDATE", [CLEANUP_META_KEY]);
    const last = metadata.rows[0]?.value;
    if (last && !due(last, input.now, input.intervalHours)) return null;
    const cutoff = new Date(input.now.getTime() - input.retentionDays * DAYS_TO_MS).toISOString();
    const eventCutoff = new Date(input.now.getTime() - input.eventRetentionDays * DAYS_TO_MS).toISOString();
    const [collectionRuns, workerRuns, accountTestResults, healthEvents, lifecycleEvents] = await Promise.all([
      deleteRows(client, "collection_runs", "finished_at", cutoff),
      deleteRows(client, "worker_runs", "COALESCE(finished_at,started_at)", cutoff),
      deleteRows(client, "target_account_test_results", "tested_at", cutoff),
      deleteRows(client, "connection_health_events", "created_at", eventCutoff),
      deleteRows(client, "connection_lifecycle_events", "created_at", eventCutoff),
    ]);
    const cleanedAt = input.now.toISOString();
    await client.query(`INSERT INTO app_runtime_metadata (key,value,updated_at) VALUES ($1,$2,$2)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`, [CLEANUP_META_KEY, cleanedAt]);
    return { collectionRuns, workerRuns, accountTestResults, healthEvents, lifecycleEvents, cutoff, eventCutoff };
  });
}

async function deleteRows(client: { query: (...args: any[]) => Promise<{ rowCount: number | null }> }, table: string, column: string, cutoff: string) {
  const result = await client.query(`DELETE FROM ${table} WHERE ${column} < $1`, [cutoff]);
  return result.rowCount ?? 0;
}

function due(value: string, now: Date, intervalHours: number) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid database cleanup timestamp: ${value}`);
  return timestamp + intervalHours * HOURS_TO_MS <= now.getTime();
}
function validateOptions(intervalHours: number, retentionDays: number, eventRetentionDays: number) {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) throw new Error("Database cleanup interval must be positive");
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) throw new Error("Database retention days must be positive");
  if (!Number.isFinite(eventRetentionDays) || eventRetentionDays <= 0) throw new Error("Database event retention days must be positive");
}
