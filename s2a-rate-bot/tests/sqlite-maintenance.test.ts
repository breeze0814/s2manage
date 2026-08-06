import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSqliteCollectionStore } from "../src/server/collection/store.ts";
import { createSqliteWorkerRunStore } from "../src/server/worker/store.ts";
import { createSqliteConnectionStore } from "../src/server/connections/store.ts";
import { createSqliteMaintenance } from "../src/storage/sqlite-maintenance.ts";
import { insertActiveConnection } from "./real-connection-test-support.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const OLD_TIMESTAMP = "2026-06-01T00:00:00.000Z";
const RECENT_TIMESTAMP = "2026-07-13T12:00:00.000Z";

test("scheduled SQLite maintenance removes expired history and keeps recent records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-maintenance-"));
  const databasePath = join(directory, "app.db");
  const databaseUrl = `file:${databasePath}`;
  try {
    await seedCollectionHistory(databaseUrl);
    await seedWorkerHistory(databaseUrl);
    seedAccountTestHistory(databasePath);
    seedConnectionEvents(databaseUrl, databasePath);
    ageFirstHistoryRecords(databasePath);

    const maintenance = createSqliteMaintenance(databaseUrl);
    const result = await maintenance.runIfDue(NOW);
    assert.deepEqual(result, {
      collectionRuns: 1, workerRuns: 1, accountTestResults: 1,
      healthEvents: 1, lifecycleEvents: 1,
      cutoff: "2026-07-12T12:00:00.000Z",
      eventCutoff: "2026-06-14T12:00:00.000Z",
    });
    assert.equal(await maintenance.runIfDue(NOW), null);
    maintenance.close();

    const database = new DatabaseSync(databasePath);
    assert.equal(count(database, "collection_runs"), 1);
    assert.equal(count(database, "collection_rate_changes"), 1);
    assert.equal(count(database, "worker_runs"), 1);
    assert.equal(count(database, "target_account_test_results"), 1);
    assert.equal(count(database, "connection_health_events"), 1);
    assert.equal(count(database, "connection_lifecycle_events"), 1);
    assert.equal(count(database, "collection_sites"), 1);
    assert.equal(count(database, "collection_group_rates"), 1);
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function seedCollectionHistory(databaseUrl: string) {
  const store = createSqliteCollectionStore(databaseUrl);
  const site = await store.create(siteInput());
  await store.recordSuccess({ siteId: site.id, refreshVersion: await store.beginRefresh(site.id), overview: overview(site.id, 1), startedAt: OLD_TIMESTAMP });
  await store.recordSuccess({ siteId: site.id, refreshVersion: await store.beginRefresh(site.id), overview: overview(site.id, 2), startedAt: NOW.toISOString() });
  store.close();
}

function seedConnectionEvents(databaseUrl: string, databasePath: string) {
  const connections = createSqliteConnectionStore(databaseUrl);
  insertActiveConnection(connections, 1);
  connections.close();
  const database = new DatabaseSync(databasePath);
  for (const timestamp of [OLD_TIMESTAMP, RECENT_TIMESTAMP]) {
    database.prepare(`INSERT INTO connection_health_events
      (connection_id, event_type, result, message, created_at)
      VALUES (?, 'policy', 'info', 'event', ?)`).run("11111111-1111-4111-8111-111111111111", timestamp);
    database.prepare(`INSERT INTO connection_lifecycle_events
      (connection_id, action, stage, result, message, created_at)
      VALUES (?, 'provision', 'complete', 'success', 'event', ?)`)
      .run("11111111-1111-4111-8111-111111111111", timestamp);
  }
  database.close();
}

function seedAccountTestHistory(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  database.prepare(`INSERT INTO target_account_test_results
    (account_id, status, message, latency_ms, model, tested_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(1, "available", "old", 10, "model", OLD_TIMESTAMP);
  database.prepare(`INSERT INTO target_account_test_results
    (account_id, status, message, latency_ms, model, tested_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(2, "available", "recent", 10, "model", RECENT_TIMESTAMP);
  database.close();
}

async function seedWorkerHistory(databaseUrl: string) {
  const store = createSqliteWorkerRunStore(databaseUrl);
  const oldId = await store.start(OLD_TIMESTAMP);
  await store.finish(oldId, summary(OLD_TIMESTAMP));
  const recentId = await store.start(NOW.toISOString());
  await store.finish(recentId, summary(NOW.toISOString()));
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
  return { name: "Source", siteType: "sub2api" as const, baseUrl: "https://example.com", websiteUrl: "", authMode: "password" as const,
    username: "user", newApiUserId: "", passwordEnc: "enc", accessTokenEnc: "enc", refreshTokenEnc: "enc",
    rechargeRatio: 1, intervalSeconds: 600, useProxy: false, enabled: true };
}

function overview(siteId: number, rate: number) {
  return { account: { sourceSiteId: siteId, label: "user", balance: 1, todayConsume: 0.5, historyRecharge: 10 }, rates: [
    { sourceSiteId: siteId, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: rate, effectiveRate: rate, collectedAt: NOW },
  ] };
}

function summary(timestamp: string) {
  return { status: "success" as const, collectedSources: 1, skippedSources: 0, failedSources: 0,
    appliedGroups: 0, skippedGroups: 0, failedGroups: 0, sentNotifications: 0,
    skippedNotifications: 2, failedNotifications: 0, errors: [], startedAt: timestamp, finishedAt: timestamp };
}
