import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { initializeSqliteSchema } from "../src/storage/sqlite-schema.ts";

test("existing collection sites gain an empty website without losing data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-source-website-"));
  const database = new DatabaseSync(join(directory, "app.db"));
  try {
    database.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      INSERT INTO schema_meta VALUES ('schema_version', '16');
      CREATE TABLE collection_sites (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        new_api_user_id TEXT NOT NULL DEFAULT '', refresh_version INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      INSERT INTO collection_sites (id, name) VALUES (7, 'Existing Source');
    `);

    initializeSqliteSchema(database);

    const columns = database.prepare("PRAGMA table_info(collection_sites)").all() as Array<{ name: string }>;
    const row = database.prepare("SELECT name, website_url FROM collection_sites WHERE id = 7").get() as { name: string; website_url: string };
    const version = database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value: string };
    assert.equal(columns.some((column) => column.name === "website_url"), true);
    assert.equal(row.name, "Existing Source");
    assert.equal(row.website_url, "");
    assert.equal(version.value, "17");
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
