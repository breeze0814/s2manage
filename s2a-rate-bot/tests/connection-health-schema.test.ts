import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createSqliteConnectionHealthStore } from "../src/server/connection-health/store.ts";
import { initializeSqliteSchema, SQLITE_SCHEMA_VERSION } from "../src/storage/sqlite-schema.ts";

test("schema 26 health states gain an explicit suspension reason", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-health-migration-"));
  const path = join(directory, "app.db");
  const databaseUrl = `file:${path}`;
  const initial = new DatabaseSync(path);
  try {
    initializeSqliteSchema(initial);
    initial.exec("ALTER TABLE connection_health_states DROP COLUMN suspension_reason");
    initial.prepare("UPDATE schema_meta SET value='26' WHERE key='schema_version'").run();
  } finally {
    initial.close();
  }
  const migrated = createSqliteConnectionHealthStore(databaseUrl);
  migrated.close();
  const inspection = new DatabaseSync(path);
  try {
    const columns = inspection.prepare("PRAGMA table_info(connection_health_states)").all() as Array<{ name: string }>;
    const version = inspection.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get() as { value: string };
    assert.equal(columns.some((column) => column.name === "suspension_reason"), true);
    assert.equal(version.value, String(SQLITE_SCHEMA_VERSION));
  } finally {
    inspection.close();
    await rm(directory, { recursive: true, force: true });
  }
});
