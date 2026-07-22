import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "./sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath, transaction } from "./sqlite-utils.ts";

const CLEANUP_META_KEY = "database_cleanup_at";
const DEFAULT_INTERVAL_HOURS = 1;
const DEFAULT_RETENTION_DAYS = 2;
const HOURS_TO_MS = 60 * 60 * 1_000;
const DAYS_TO_MS = 24 * HOURS_TO_MS;

export type SqliteMaintenance = {
  readonly runIfDue: (now?: Date) => DatabaseCleanupResult | null;
  readonly close: () => void;
};

export type DatabaseCleanupResult = {
  readonly collectionRuns: number;
  readonly workerRuns: number;
  readonly accountTestResults: number;
  readonly cutoff: string;
};

export function createSqliteMaintenance(
  databaseUrl: string,
  options: Readonly<{ intervalHours?: number; retentionDays?: number }> = {},
): SqliteMaintenance {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  const intervalHours = options.intervalHours ?? DEFAULT_INTERVAL_HOURS;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  return {
    runIfDue: (now = new Date()) => runIfDue(database, { now, intervalHours, retentionDays }),
    close: () => database.close(),
  };
}

function runIfDue(database: DatabaseSync, input: Readonly<{ now: Date; intervalHours: number; retentionDays: number }>) {
  validateOptions(input.intervalHours, input.retentionDays);
  if (!cleanupDue(database, input.now, input.intervalHours)) return null;
  const cutoff = new Date(input.now.getTime() - input.retentionDays * DAYS_TO_MS).toISOString();
  const result = deleteExpiredHistory(database, cutoff, input.now.toISOString());
  if (result.collectionRuns + result.workerRuns + result.accountTestResults > 0) compactDatabase(database);
  return { ...result, cutoff };
}

function cleanupDue(database: DatabaseSync, now: Date, intervalHours: number) {
  const row = database.prepare("SELECT value FROM schema_meta WHERE key = ?").get(CLEANUP_META_KEY) as { value: string } | undefined;
  if (!row) return true;
  const lastCleanup = new Date(row.value).getTime();
  if (!Number.isFinite(lastCleanup)) throw new Error(`Invalid database cleanup timestamp: ${row.value}`);
  return lastCleanup + intervalHours * HOURS_TO_MS <= now.getTime();
}

function deleteExpiredHistory(database: DatabaseSync, cutoff: string, cleanedAt: string) {
  let collectionRuns = 0;
  let workerRuns = 0;
  let accountTestResults = 0;
  transaction(database, () => {
    collectionRuns = Number(database.prepare("DELETE FROM collection_runs WHERE finished_at < ?").run(cutoff).changes);
    workerRuns = Number(database.prepare("DELETE FROM worker_runs WHERE COALESCE(finished_at, started_at) < ?").run(cutoff).changes);
    accountTestResults = Number(database.prepare("DELETE FROM target_account_test_results WHERE tested_at < ?").run(cutoff).changes);
    database.prepare(`INSERT INTO schema_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(CLEANUP_META_KEY, cleanedAt);
  });
  return { collectionRuns, workerRuns, accountTestResults };
}

function compactDatabase(database: DatabaseSync) {
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
  database.exec("PRAGMA optimize");
}

function validateOptions(intervalHours: number, retentionDays: number) {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) throw new Error("Database cleanup interval must be positive");
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) throw new Error("Database retention days must be positive");
}
