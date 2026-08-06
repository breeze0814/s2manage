import { execute, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { LifecycleEventQuery } from "./event-store.ts";
import type { ConnectionLifecycleEvent, ConnectionLifecycleEventPage, NewConnectionLifecycleEvent } from "./types.ts";

export async function insertPostgresLifecycleEvent(context: PostgresContext, event: NewConnectionLifecycleEvent) {
  await execute(context, `INSERT INTO connection_lifecycle_events
    (connection_id,action,stage,result,message,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
  [event.connectionId, event.action, event.stage, event.result, event.message, event.createdAt]);
}

export async function readPostgresLifecycleEventPage(context: PostgresContext, query: LifecycleEventQuery) {
  const filter = eventFilter(query);
  const values = await rows<Record<string, unknown>>(context, `SELECT events.*,connections.source_site_name,
    connections.source_group_name,connections.target_account_name FROM connection_lifecycle_events events
    JOIN real_connections connections ON connections.id=events.connection_id ${filter.where}
    ORDER BY events.id DESC LIMIT $${filter.values.length + 1}`, [...filter.values, query.limit + 1]);
  return eventPage(values, query.limit);
}

function eventFilter(query: LifecycleEventQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (query.connectionId !== undefined) {
    values.push(query.connectionId);
    clauses.push(`events.connection_id=$${values.length}`);
  }
  if (query.beforeId !== undefined) {
    values.push(query.beforeId);
    clauses.push(`events.id<$${values.length}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function eventPage(values: readonly Record<string, unknown>[], limit: number): ConnectionLifecycleEventPage {
  const hasMore = values.length > limit;
  const events = values.slice(0, limit).map(mapEvent);
  return { events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null };
}

function mapEvent(value: Record<string, unknown>): ConnectionLifecycleEvent {
  return { id: Number(value.id), connectionId: String(value.connection_id),
    action: String(value.action) as ConnectionLifecycleEvent["action"],
    stage: String(value.stage) as ConnectionLifecycleEvent["stage"],
    result: String(value.result) as ConnectionLifecycleEvent["result"], message: String(value.message),
    createdAt: String(value.created_at), sourceSiteName: String(value.source_site_name),
    sourceGroupName: String(value.source_group_name), targetAccountName: String(value.target_account_name) };
}
