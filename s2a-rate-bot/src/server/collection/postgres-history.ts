import type { PostgresContext } from "../infrastructure/postgres-context.ts";
import { rows } from "../infrastructure/postgres-context.ts";
import type { CollectionChangesQuery, CollectionRunRecord, CollectionRunsQuery } from "./history.ts";
import type { CollectionRateChange } from "./types.ts";

const DEFAULT_CHANGE_LIMIT = 50;
const DEFAULT_RUN_LIMIT = 30;

export async function readPostgresChanges(context: PostgresContext, query: CollectionChangesQuery = {}) {
  const filter = buildChangeFilter(query);
  const order = query.afterId === undefined ? "changes.collected_at DESC,changes.id DESC" : "changes.id ASC";
  const values = await rows<Record<string, unknown>>(context, `SELECT changes.*,sites.name AS site_name
    FROM collection_rate_changes AS changes JOIN collection_sites AS sites ON sites.id=changes.site_id
    ${filter.where} ORDER BY ${order} LIMIT $${filter.values.length + 1}`,
  [...filter.values, query.limit ?? DEFAULT_CHANGE_LIMIT]);
  return values.map(mapChange);
}

export async function readPostgresRuns(context: PostgresContext, query: CollectionRunsQuery = {}) {
  const filter = buildRunFilter(query);
  const values = await rows<Record<string, unknown>>(context, `SELECT runs.*,sites.name AS site_name
    FROM collection_runs AS runs JOIN collection_sites AS sites ON sites.id=runs.site_id
    ${filter.where} ORDER BY runs.started_at DESC,runs.id DESC LIMIT $${filter.values.length + 1}`,
  [...filter.values, query.limit ?? DEFAULT_RUN_LIMIT]);
  return values.map(mapRun);
}

function buildChangeFilter(query: CollectionChangesQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  addFilter(clauses, values, "changes.collected_at >=", query.since);
  addFilter(clauses, values, "changes.id >", query.afterId);
  addFilter(clauses, values, "changes.site_id =", query.siteId);
  addFilter(clauses, values, "changes.group_id =", query.groupId);
  addFilter(clauses, values, "changes.change_type =", query.changeType);
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function buildRunFilter(query: CollectionRunsQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  addFilter(clauses, values, "runs.started_at >=", query.since);
  addFilter(clauses, values, "runs.site_id =", query.siteId);
  addFilter(clauses, values, "runs.status =", query.status);
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function addFilter(clauses: string[], values: unknown[], expression: string, value: unknown) {
  if (value === undefined) return;
  values.push(value);
  clauses.push(`${expression} $${values.length}`);
}

function mapChange(value: Record<string, unknown>): CollectionRateChange {
  return { id: Number(value.id), runId: Number(value.run_id), sourceSiteId: Number(value.site_id),
    sourceSiteName: String(value.site_name), groupId: String(value.group_id), groupName: String(value.group_name),
    platform: nullableText(value.platform), changeType: String(value.change_type) as CollectionRateChange["changeType"],
    oldRate: nullableNumber(value.old_rate), newRate: nullableNumber(value.new_rate), collectedAt: String(value.collected_at) };
}

function mapRun(value: Record<string, unknown>): CollectionRunRecord {
  const startedAt = String(value.started_at);
  const finishedAt = String(value.finished_at);
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error(`采集运行记录时间无效: ${String(value.id)}`);
  return { id: Number(value.id), sourceSiteId: Number(value.site_id), sourceSiteName: String(value.site_name),
    status: String(value.status) as CollectionRunRecord["status"], error: nullableText(value.error),
    groupCount: Number(value.group_count), startedAt, finishedAt, durationMs };
}

function nullableText(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : Number(value); }
