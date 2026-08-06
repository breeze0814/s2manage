import type { DatabaseSync } from "node:sqlite";
import type { CollectionRateChange, CollectionRateChangeType } from "./types.ts";

const DEFAULT_CHANGE_LIMIT = 50;
const DEFAULT_RUN_LIMIT = 30;

export type CollectionChangesQuery = {
  readonly limit?: number;
  readonly since?: string;
  readonly afterId?: number;
  readonly siteId?: number;
  readonly groupId?: string;
  readonly changeType?: CollectionRateChangeType;
};

export type CollectionRunStatus = "success" | "partial" | "failed";

export type CollectionRunRecord = {
  readonly id: number;
  readonly sourceSiteId: number;
  readonly sourceSiteName: string;
  readonly status: CollectionRunStatus;
  readonly error: string | null;
  readonly groupCount: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
};

export type CollectionRunsQuery = {
  readonly limit?: number;
  readonly since?: string;
  readonly siteId?: number;
  readonly status?: CollectionRunStatus;
};

export function readChanges(database: DatabaseSync, query: CollectionChangesQuery = {}): CollectionRateChange[] {
  const limit = query.limit ?? DEFAULT_CHANGE_LIMIT;
  const order = query.afterId === undefined ? "changes.collected_at DESC, changes.id DESC" : "changes.id ASC";
  const rows = database.prepare(`SELECT changes.*, sites.name AS site_name
    FROM collection_rate_changes AS changes
    JOIN collection_sites AS sites ON sites.id = changes.site_id
    WHERE (:since IS NULL OR changes.collected_at >= :since)
      AND (:afterId IS NULL OR changes.id > :afterId)
      AND (:siteId IS NULL OR changes.site_id = :siteId)
      AND (:groupId IS NULL OR changes.group_id = :groupId)
      AND (:changeType IS NULL OR changes.change_type = :changeType)
    ORDER BY ${order} LIMIT :limit`).all({
      since: query.since ?? null,
      afterId: query.afterId ?? null,
      siteId: query.siteId ?? null,
      groupId: query.groupId ?? null,
      changeType: query.changeType ?? null,
      limit,
    }) as Record<string, unknown>[];
  return rows.map(mapChange);
}

export function readRuns(database: DatabaseSync, query: CollectionRunsQuery = {}): CollectionRunRecord[] {
  const limit = query.limit ?? DEFAULT_RUN_LIMIT;
  const rows = database.prepare(`SELECT runs.*, sites.name AS site_name
    FROM collection_runs AS runs
    JOIN collection_sites AS sites ON sites.id = runs.site_id
    WHERE (:since IS NULL OR runs.started_at >= :since)
      AND (:siteId IS NULL OR runs.site_id = :siteId)
      AND (:status IS NULL OR runs.status = :status)
    ORDER BY runs.started_at DESC, runs.id DESC LIMIT :limit`).all({
      since: query.since ?? null,
      siteId: query.siteId ?? null,
      status: query.status ?? null,
      limit,
    }) as Record<string, unknown>[];
  return rows.map(mapRun);
}

function mapChange(row: Record<string, unknown>): CollectionRateChange {
  return {
    id: Number(row.id), runId: Number(row.run_id), sourceSiteId: Number(row.site_id),
    sourceSiteName: String(row.site_name), groupId: String(row.group_id), groupName: String(row.group_name),
    platform: nullableText(row.platform), changeType: String(row.change_type) as CollectionRateChange["changeType"],
    oldRate: nullableNumber(row.old_rate), newRate: nullableNumber(row.new_rate), collectedAt: String(row.collected_at),
  };
}

function mapRun(row: Record<string, unknown>): CollectionRunRecord {
  const startedAt = String(row.started_at);
  const finishedAt = String(row.finished_at);
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error(`采集运行记录时间无效: ${String(row.id)}`);
  return {
    id: Number(row.id), sourceSiteId: Number(row.site_id), sourceSiteName: String(row.site_name),
    status: String(row.status) as CollectionRunStatus, error: nullableText(row.error),
    groupCount: Number(row.group_count), startedAt, finishedAt, durationMs,
  };
}

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
