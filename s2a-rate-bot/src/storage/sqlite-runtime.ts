import type { DatabaseSync } from "node:sqlite";
import type { RuntimeEvent, RuntimeEventInput } from "./app-config.ts";
import { all, execute, int, nowIso, one, text, type SqliteRow } from "./sqlite-utils.ts";

export function recordRuntimeEvent(database: DatabaseSync, event: RuntimeEventInput): RuntimeEvent {
  const createdAt = nowIso();
  execute(database, `
    INSERT INTO runtime_events (service, event_type, status, message, metadata_json, created_at)
    VALUES (:service, :eventType, :status, :message, :metadataJson, :createdAt)
  `, {
    service: event.service,
    eventType: event.eventType,
    status: event.status,
    message: event.message,
    metadataJson: JSON.stringify(event.metadata ?? {}),
    createdAt,
  });
  const row = one(database, "SELECT * FROM runtime_events WHERE rowid = last_insert_rowid()");
  if (!row) throw new Error("Failed to record runtime event");
  return runtimeEvent(row);
}

export function listRuntimeEvents(
  database: DatabaseSync,
  input: { readonly limit?: number; readonly service?: RuntimeEventInput["service"] } = {},
): RuntimeEvent[] {
  const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 100);
  const rows = input.service
    ? all(database, `
      SELECT * FROM runtime_events
      WHERE service = :service
      ORDER BY id DESC
      LIMIT :limit
    `, { service: input.service, limit })
    : all(database, `
      SELECT * FROM runtime_events
      ORDER BY id DESC
      LIMIT :limit
    `, { limit });
  return rows.map(runtimeEvent);
}

function runtimeEvent(row: SqliteRow): RuntimeEvent {
  return {
    id: int(row.id),
    service: text(row.service) as RuntimeEvent["service"],
    eventType: text(row.event_type),
    status: text(row.status) as RuntimeEvent["status"],
    message: text(row.message),
    metadata: metadata(row.metadata_json),
    createdAt: text(row.created_at),
  };
}

function metadata(value: unknown) {
  const parsed = JSON.parse(text(value) || "{}") as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
