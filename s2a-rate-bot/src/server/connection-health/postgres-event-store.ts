import { execute, rows, type PostgresContext } from "../infrastructure/postgres-context.ts";
import type { HealthEventQuery } from "./event-store.ts";
import type { ConnectionHealthEvent, ConnectionHealthEventPage, NewHealthEvent } from "./types.ts";

export async function insertPostgresHealthEvent(context: PostgresContext, event: NewHealthEvent) {
  await execute(context, `INSERT INTO connection_health_events
    (connection_id,event_type,result,from_state,to_state,message,latency_ms,model,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [event.connectionId, event.eventType, event.result,
    event.fromState, event.toState, event.message, event.latencyMs, event.model, event.createdAt]);
}

export async function readPostgresHealthEventPage(context: PostgresContext, query: HealthEventQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (query.connectionId !== undefined) { values.push(query.connectionId); clauses.push(`events.connection_id=$${values.length}`); }
  if (query.beforeId !== undefined) { values.push(query.beforeId); clauses.push(`events.id<$${values.length}`); }
  const result = await rows<Record<string, unknown>>(context, `SELECT events.*,connections.source_site_name,
    connections.source_group_name,connections.target_account_name FROM connection_health_events events
    JOIN real_connections connections ON connections.id=events.connection_id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY events.id DESC LIMIT $${values.length + 1}`, [...values, query.limit + 1]);
  const hasMore = result.length > query.limit;
  const events = result.slice(0, query.limit).map(mapEvent);
  return { events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null } satisfies ConnectionHealthEventPage;
}

function mapEvent(value: Record<string, unknown>): ConnectionHealthEvent {
  return { id: Number(value.id), connectionId: String(value.connection_id),
    eventType: String(value.event_type) as ConnectionHealthEvent["eventType"],
    result: String(value.result) as ConnectionHealthEvent["result"], fromState: text(value.from_state) as ConnectionHealthEvent["fromState"],
    toState: text(value.to_state) as ConnectionHealthEvent["toState"], message: String(value.message),
    latencyMs: number(value.latency_ms), model: text(value.model), createdAt: String(value.created_at),
    sourceSiteName: String(value.source_site_name), sourceGroupName: String(value.source_group_name),
    targetAccountName: String(value.target_account_name) };
}
function text(value: unknown) { return value === null || value === undefined ? null : String(value); }
function number(value: unknown) { return value === null || value === undefined ? null : Number(value); }
