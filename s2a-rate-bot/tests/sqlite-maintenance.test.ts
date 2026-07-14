import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSqliteCollectionStore } from "../src/server/collection/store.ts";
import { createSqliteWorkerRunStore } from "../src/server/worker/store.ts";
import { createSqliteMaintenance } from "../src/storage/sqlite-maintenance.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const OLD_TIMESTAMP = "2026-06-01T00:00:00.000Z";

test("scheduled SQLite maintenance removes expired history and keeps recent records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-maintenance-"));
  const databasePath = join(directory, "app.db");
  const databaseUrl = `file:${databasePath}`;
  try {
    seedCollectionHistory(databaseUrl);
    seedWorkerHistory(databaseUrl);
    ageFirstHistoryRecords(databasePath);

    const maintenance = createSqliteMaintenance(databaseUrl);
    const result = maintenance.runIfDue(NOW);
    assert.deepEqual(result, { collectionRuns: 1, workerRuns: 1, cutoff: "2026-06-14T12:00:00.000Z" });
    assert.equal(maintenance.runIfDue(NOW), null);
    maintenance.close();

    const database = new DatabaseSync(databasePath);
    assert.equal(count(database, "collection_runs"), 1);
    assert.equal(count(database, "collection_rate_changes"), 1);
    assert.equal(count(database, "worker_runs"), 1);
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function seedCollectionHistory(databaseUrl: string) {
  const store = createSqliteCollectionStore(databaseUrl);
  const site = store.create(siteInput());
  store.recordSuccess(site.id, overview(site.id, 1), OLD_TIMESTAMP);
  store.recordSuccess(site.id, overview(site.id, 2), NOW.toISOString());
  store.close();
}

function seedWorkerHistory(databaseUrl: string) {
  const store = createSqliteWorkerRunStore(databaseUrl);
  const oldId = store.start(OLD_TIMESTAMP);
  store.finish(oldId, summary(OLD_TIMESTAMP));
  const recentId = store.start(NOW.toISOString());
  store.finish(recentId, summary(NOW.toISOString()));
  store.close();
}

function ageFirstHistoryRecords(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  const firstRun = database.prepare("SELECT id FROM collection_runs ORDER BY id LIMIT 1").get() as { id: number };
  database.prepare("UPDATE collection_runs SET finished_at = ? WHERE id = ?").run(OLD_TIMESTAMP, firstRun.id);
  database.prepare("UPDATE collection_rate_changes SET collected_at = ? WHERE run_id = ?").run(OLD_TIMESTAMP, firstRun.id);
  database.close();
}

function count(database: DatabaseSync, table: string) {
  const row = database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
  return Number(row.total);
}

function siteInput() {
  return { name: "Source", siteType: "sub2api" as const, baseUrl: "https://example.com", authMode: "password" as const,
    username: "user", newApiUserId: "", passwordEnc: "enc", accessTokenEnc: "enc", refreshTokenEnc: "enc",
    rechargeRatio: 1, intervalSeconds: 600, useProxy: false, enabled: true };
}

function overview(siteId: number, rate: number) {
  return { account: { sourceSiteId: siteId, label: "user", balance: 1 }, rates: [
    { sourceSiteId: siteId, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: rate, effectiveRate: rate, collectedAt: NOW },
  ] };
}

function summary(timestamp: string) {
  return { status: "success" as const, collectedSources: 1, skippedSources: 0, failedSources: 0,
    appliedGroups: 0, skippedGroups: 0, failedGroups: 0, errors: [], startedAt: timestamp, finishedAt: timestamp };
}
