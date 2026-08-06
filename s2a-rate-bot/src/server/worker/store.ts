import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { WorkerRunSummary, WorkerRunStatus } from "./service.ts";
import type { Awaitable } from "../infrastructure/postgres-context.ts";

export type WorkerRunRecord = WorkerRunSummary & { readonly id: number };

export type WorkerRunStore = {
  readonly start: (startedAt: string) => Awaitable<number>;
  readonly finish: (id: number, summary: WorkerRunSummary) => Awaitable<void>;
  readonly latest: () => Awaitable<WorkerRunRecord | null>;
  readonly close: () => Awaitable<void>;
};

export function createSqliteWorkerRunStore(databaseUrl: string): WorkerRunStore {
  const path = sqlitePath(databaseUrl);
  ensureDatabaseDirectory(path);
  const database = new DatabaseSync(path, { timeout: 5_000 });
  initializeSqliteSchema(database);
  return createWorkerRunStore(database);
}

function createWorkerRunStore(database: DatabaseSync): WorkerRunStore {
  return {
    start: (startedAt) => startRun(database, startedAt),
    finish: (id, summary) => finishRun(database, id, summary),
    latest: () => latestRun(database),
    close: () => database.close(),
  };
}

function startRun(database: DatabaseSync, startedAt: string) {
  const result = database.prepare(`INSERT INTO worker_runs (
    status, collected_sources, skipped_sources, failed_sources, applied_groups,
    skipped_groups, failed_groups, sent_notifications, skipped_notifications,
    failed_notifications, errors_json, started_at, finished_at
  ) VALUES ('running', 0, 0, 0, 0, 0, 0, 0, 0, 0, '[]', ?, NULL)`).run(startedAt);
  return Number(result.lastInsertRowid);
}

function finishRun(database: DatabaseSync, id: number, summary: WorkerRunSummary) {
  const result = database.prepare(`UPDATE worker_runs SET status=:status,
    collected_sources=:collectedSources, skipped_sources=:skippedSources,
    failed_sources=:failedSources, applied_groups=:appliedGroups,
    skipped_groups=:skippedGroups, failed_groups=:failedGroups,
    sent_notifications=:sentNotifications, skipped_notifications=:skippedNotifications,
    failed_notifications=:failedNotifications,
    errors_json=:errorsJson, finished_at=:finishedAt WHERE id=:id`).run({
    id,
    status: summary.status,
    collectedSources: summary.collectedSources,
    skippedSources: summary.skippedSources,
    failedSources: summary.failedSources,
    appliedGroups: summary.appliedGroups,
    skippedGroups: summary.skippedGroups,
    failedGroups: summary.failedGroups,
    sentNotifications: summary.sentNotifications,
    skippedNotifications: summary.skippedNotifications,
    failedNotifications: summary.failedNotifications,
    errorsJson: JSON.stringify(summary.errors),
    finishedAt: summary.finishedAt,
  });
  if (result.changes !== 1) throw new Error(`Worker run does not exist: ${id}`);
}

function latestRun(database: DatabaseSync): WorkerRunRecord | null {
  const row = database.prepare("SELECT * FROM worker_runs ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    status: String(row.status) as WorkerRunStatus,
    collectedSources: Number(row.collected_sources),
    skippedSources: Number(row.skipped_sources),
    failedSources: Number(row.failed_sources),
    appliedGroups: Number(row.applied_groups),
    skippedGroups: Number(row.skipped_groups),
    failedGroups: Number(row.failed_groups),
    sentNotifications: Number(row.sent_notifications),
    skippedNotifications: Number(row.skipped_notifications),
    failedNotifications: Number(row.failed_notifications),
    errors: parseErrors(row.errors_json),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at),
  };
}

function parseErrors(value: unknown) {
  const parsed: unknown = JSON.parse(String(value));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid worker run errors_json");
  }
  return parsed as string[];
}
