import { execute, row, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { WorkerRunSummary, WorkerRunStatus } from "./service.ts";
import type { WorkerRunRecord, WorkerRunStore } from "./store.ts";

type RunRow = Record<string, unknown>;

export function createPostgresWorkerRunStore(context: PostgresContext): WorkerRunStore {
  return {
    start: async (startedAt) => {
      const created = await row<{ id: number }>(context, `INSERT INTO worker_runs
        (status,collected_sources,skipped_sources,failed_sources,applied_groups,skipped_groups,
          failed_groups,sent_notifications,skipped_notifications,failed_notifications,errors_json,started_at)
        VALUES ('running',0,0,0,0,0,0,0,0,0,'[]',$1) RETURNING id`, [startedAt]);
      if (!created) throw new Error("Worker run creation failed");
      return created.id;
    },
    finish: (id, summary) => finishRun(context, id, summary),
    latest: async () => mapRun(await row<RunRow>(context, "SELECT * FROM worker_runs ORDER BY id DESC LIMIT 1")),
    close: async () => undefined,
  };
}

async function finishRun(context: PostgresContext, id: number, summary: WorkerRunSummary) {
  const result = await execute(context, `UPDATE worker_runs SET status=$2,collected_sources=$3,
    skipped_sources=$4,failed_sources=$5,applied_groups=$6,skipped_groups=$7,failed_groups=$8,
    sent_notifications=$9,skipped_notifications=$10,failed_notifications=$11,errors_json=$12,finished_at=$13
    WHERE id=$1`, [id, summary.status, summary.collectedSources, summary.skippedSources, summary.failedSources,
    summary.appliedGroups, summary.skippedGroups, summary.failedGroups, summary.sentNotifications,
    summary.skippedNotifications, summary.failedNotifications, JSON.stringify(summary.errors), summary.finishedAt]);
  if (result.rowCount !== 1) throw new Error(`Worker run does not exist: ${id}`);
}

function mapRun(value: RunRow | null): WorkerRunRecord | null {
  if (!value) return null;
  return { id: Number(value.id), status: String(value.status) as WorkerRunStatus,
    collectedSources: Number(value.collected_sources), skippedSources: Number(value.skipped_sources),
    failedSources: Number(value.failed_sources), appliedGroups: Number(value.applied_groups),
    skippedGroups: Number(value.skipped_groups), failedGroups: Number(value.failed_groups),
    sentNotifications: Number(value.sent_notifications), skippedNotifications: Number(value.skipped_notifications),
    failedNotifications: Number(value.failed_notifications), errors: parseErrors(value.errors_json),
    startedAt: String(value.started_at), finishedAt: value.finished_at === null ? null : String(value.finished_at) };
}

function parseErrors(value: unknown) {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error("Invalid worker run errors_json");
  return parsed as string[];
}
