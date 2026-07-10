import { DatabaseSync } from "node:sqlite";
import { initializeSqliteSchema } from "../../storage/sqlite-schema.ts";
import { ensureDatabaseDirectory, sqlitePath } from "../../storage/sqlite-utils.ts";
import type { WorkerRunSummary, WorkerRunStatus } from "./service.ts";

export type WorkerRunRecord = WorkerRunSummary & { readonly id: number };

export type WorkerRunStore = {
  readonly start: (startedAt: string) => number;
  readonly finish: (id: number, summary: WorkerRunSummary) => void;
  readonly latest: () => WorkerRunRecord | null;
  readonly close: () => void;
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
    skipped_groups, failed_groups, errors_json, started_at, finished_at
  ) VALUES ('running', 0, 0, 0, 0, 0, 0, '[]', ?, NULL)`).run(startedAt);
  return Number(result.lastInsertRowid);
}

function finishRun(database: DatabaseSync, id: number, summary: WorkerRunSummary) {
  const result = database.prepare(`UPDATE worker_runs SET status=:status,
    collected_sources=:collectedSources, skipped_sources=:skippedSources,
    failed_sources=:failedSources, applied_groups=:appliedGroups,
    skipped_groups=:skippedGroups, failed_groups=:failedGroups,
    errors_json=:errorsJson, finished_at=:finishedAt WHERE id=:id`).run({
    id,
    status: summary.status,
    collectedSources: summary.collectedSources,
    skippedSources: summary.skippedSources,
    failedSources: summary.failedSources,
    appliedGroups: summary.appliedGroups,
    skippedGroups: summary.skippedGroups,
    failedGroups: summary.failedGroups,
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
