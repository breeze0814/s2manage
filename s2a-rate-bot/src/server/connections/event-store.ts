import type { DatabaseSync } from "node:sqlite";
import type {
  ConnectionLifecycleEvent, ConnectionLifecycleEventPage, NewConnectionLifecycleEvent,
} from "./types.ts";

export type LifecycleEventQuery = Readonly<{
  connectionId?: string;
  beforeId?: number;
  limit: number;
}>;

export function insertLifecycleEvent(database: DatabaseSync, event: NewConnectionLifecycleEvent) {
  database.prepare(`INSERT INTO connection_lifecycle_events
    (connection_id, action, stage, result, message, created_at)
    VALUES (:connectionId, :action, :stage, :result, :message, :createdAt)`).run(event);
}

export function readLifecycleEventPage(
  database: DatabaseSync,
  query: LifecycleEventQuery,
): ConnectionLifecycleEventPage {
  const rows = database.prepare(`SELECT events.*, connections.source_site_name,
    connections.source_group_name, connections.target_account_name
    FROM connection_lifecycle_events AS events
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
  const events = rows.slice(0, query.limit).map(mapLifecycleEvent);
  return { events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null };
}

function mapLifecycleEvent(row: Row): ConnectionLifecycleEvent {
  return {
    id: Number(row.id),
    connectionId: String(row.connection_id),
    action: String(row.action) as ConnectionLifecycleEvent["action"],
    stage: String(row.stage) as ConnectionLifecycleEvent["stage"],
    result: String(row.result) as ConnectionLifecycleEvent["result"],
    message: String(row.message),
    createdAt: String(row.created_at),
    sourceSiteName: String(row.source_site_name),
    sourceGroupName: String(row.source_group_name),
    targetAccountName: String(row.target_account_name),
  };
}

type Row = Record<string, unknown>;
