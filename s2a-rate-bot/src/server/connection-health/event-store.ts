import type { DatabaseSync } from "node:sqlite";
import type {
  ConnectionHealthEvent, ConnectionHealthEventPage, NewHealthEvent,
} from "./types.ts";

export type HealthEventQuery = Readonly<{
  connectionId?: string;
  beforeId?: number;
  limit: number;
}>;

export function insertHealthEvent(database: DatabaseSync, event: NewHealthEvent) {
  database.prepare(`INSERT INTO connection_health_events
    (connection_id, event_type, result, from_state, to_state, message, latency_ms, model, created_at)
    VALUES (:connectionId, :eventType, :result, :fromState, :toState, :message, :latencyMs, :model, :createdAt)`).run(event);
}

export function readHealthEventPage(
  database: DatabaseSync,
  query: HealthEventQuery,
): ConnectionHealthEventPage {
  const rows = database.prepare(`SELECT events.*, connections.source_site_name,
    connections.source_group_name, connections.target_account_name
    FROM connection_health_events AS events
    JOIN real_connections AS connections ON connections.id=events.connection_id
    WHERE (? IS NULL OR events.connection_id=?) AND (? IS NULL OR events.id<?)
    ORDER BY events.id DESC LIMIT ?`).all(
    query.connectionId ?? null,
    query.connectionId ?? null,
    query.beforeId ?? null,
    query.beforeId ?? null,
    query.limit + 1,
  ) as Row[];
  const hasMore = rows.length > query.limit;
  const events = rows.slice(0, query.limit).map(mapHealthEvent);
  return { events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null };
}

function mapHealthEvent(row: Row): ConnectionHealthEvent {
  return {
    id: Number(row.id),
    connectionId: String(row.connection_id),
    eventType: String(row.event_type) as ConnectionHealthEvent["eventType"],
    result: String(row.result) as ConnectionHealthEvent["result"],
    fromState: text(row.from_state) as ConnectionHealthEvent["fromState"],
    toState: text(row.to_state) as ConnectionHealthEvent["toState"],
    message: String(row.message),
    latencyMs: number(row.latency_ms),
    model: text(row.model),
    createdAt: String(row.created_at),
    sourceSiteName: String(row.source_site_name),
    sourceGroupName: String(row.source_group_name),
    targetAccountName: String(row.target_account_name),
  };
}

function text(value: unknown) { return value === null || value === undefined ? null : String(value); }
function number(value: unknown) { return value === null || value === undefined ? null : Number(value); }
type Row = Record<string, unknown>;
