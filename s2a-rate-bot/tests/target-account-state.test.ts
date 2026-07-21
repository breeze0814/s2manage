import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createTargetAccountService } from "../src/server/target-accounts/service.ts";
import { createSqliteTargetAccountStore } from "../src/server/target-accounts/store.ts";
import type { TargetAccountClient } from "../src/server/target-accounts/types.ts";
import { initializeSqliteSchema } from "../src/storage/sqlite-schema.ts";

test("account source binding persists across remote account refreshes", async () => {
  const changes: boolean[] = [];
  const client = defaultClient(undefined, async (_accountId, schedulable) => { changes.push(schedulable); });
  await withAccountService(client, async ({ service }) => {
    await service.refresh();
    const bound = await service.saveBinding(9, { sourceSiteId: 1, sourceGroupId: "vip" });
    assert.deepEqual(bound?.binding, { sourceSiteId: 1, sourceGroupId: "vip", autoManageSchedulable: false });
    await service.testChannel(9);
    assert.deepEqual(changes, []);
    await assert.rejects(service.saveBinding(9, { sourceSiteId: 1, sourceGroupId: "missing" }), /采集分组不存在/);
    assert.deepEqual((await service.refresh())[0]?.binding, { sourceSiteId: 1, sourceGroupId: "vip", autoManageSchedulable: false });
  });
});

test("automated scheduling failures remain explicit after recording the test", async () => {
  const client = defaultClient(undefined, async () => { throw new Error("schedule rejected"); });
  await withAccountService(client, async ({ service }) => {
    await service.refresh();
    await service.saveBinding(9, { sourceSiteId: 1, sourceGroupId: "vip", autoManageSchedulable: true });
    await assert.rejects(service.testChannel(9), /schedule rejected/);
    assert.equal((await service.list())[0]?.lastTest?.status, "available");
    assert.equal((await service.list())[0]?.schedulable, true);
  });
});

test("manual account scheduling updates the remote API and local snapshot", async () => {
  const changes: Array<{ accountId: number; schedulable: boolean }> = [];
  const client = defaultClient(undefined, async (accountId, schedulable) => { changes.push({ accountId, schedulable }); });
  await withAccountService(client, async ({ service }) => {
    await service.refresh();
    const account = await service.setSchedulable(9, false);
    assert.equal(account?.schedulable, false);
    assert.deepEqual(changes, [{ accountId: 9, schedulable: false }]);
  });
});

test("enabled test automation follows success, rejection, and request errors", async () => {
  const changes: boolean[] = [];
  let outcome: "available" | "unavailable" | "error" = "available";
  const client = defaultClient(async () => {
    if (outcome === "error") throw new Error("upstream offline");
    return { success: outcome === "available", message: outcome, latencyMs: 1 };
  }, async (_accountId, schedulable) => { changes.push(schedulable); });
  await withAccountService(client, async ({ service }) => {
    await service.refresh();
    await service.saveBinding(9, { sourceSiteId: 1, sourceGroupId: "vip", autoManageSchedulable: true });
    assert.equal((await service.testChannel(9)).account.schedulable, true);
    outcome = "unavailable";
    assert.equal((await service.testChannel(9)).account.schedulable, false);
    outcome = "error";
    assert.equal((await service.testChannel(9)).account.schedulable, false);
    assert.deepEqual(changes, [true, false, false]);
  });
});

test("single and batch tests persist explicit account test states", async () => {
  let active = 0;
  let maxActive = 0;
  const client = defaultClient(async (accountId) => {
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    if (accountId === 10) throw new Error("upstream offline");
    return { success: true, message: "ok", latencyMs: 12, model: "gpt-4o-mini" };
  });
  await withAccountService(client, async ({ service }) => {
    await service.refresh();
    const single = await service.testChannel(9);
    assert.equal(single.test.status, "available");
    assert.equal((await service.list())[0]?.lastTest?.model, "gpt-4o-mini");
    const batch = await service.testAllChannels();
    assert.deepEqual(batch.summary, { total: 2, available: 1, unavailable: 0, errors: 1 });
    assert.equal(batch.accounts.find((account) => account.id === 10)?.lastTest?.message, "upstream offline");
    assert.equal(maxActive, 2);
    assert.equal((await service.refresh())[0]?.lastTest?.status, "available");
  });
});

async function withAccountService(client: TargetAccountClient, task: (context: AccountContext) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-account-state-"));
  const databasePath = join(directory, "app.db");
  seedSourceSite(databasePath);
  const store = createSqliteTargetAccountStore(`file:${databasePath}`);
  const service = createTargetAccountService({
    client, store, sourceRates: async () => [sourceRate()], testConcurrency: async () => 2,
  });
  try { await task({ service }); }
  finally { store.close(); await rm(directory, { recursive: true, force: true }); }
}

function seedSourceSite(path: string) {
  const database = new DatabaseSync(path);
  initializeSqliteSchema(database);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO collection_sites
    (id, name, site_type, base_url, auth_mode, username, new_api_user_id, password_enc,
      access_token_enc, refresh_token_enc, recharge_ratio, interval_seconds, use_proxy,
      enabled, consecutive_failures, refresh_version, created_at, updated_at)
    VALUES (1, 'Source A', 'sub2api', 'https://source.example', 'manual_token', '', '', '', '', '', 1, 60, 0, 1, 0, 0, ?, ?)`)
    .run(now, now);
  database.close();
}

function defaultClient(
  testChannel: TargetAccountClient["testChannel"] = async () => ({ success: true, message: "ok", latencyMs: 1 }),
  setSchedulable: TargetAccountClient["setSchedulable"] = async () => {},
) {
  return { listAccounts: async () => [account(9), account(10)], testChannel, setSchedulable };
}

function account(id: number) { return { id, name: `Account ${id}`, platform: "openai", status: "active", schedulable: true, rateMultiplier: 1, priority: id, groupIds: [7] }; }
function sourceRate() { return { sourceSiteId: 1, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: 1, effectiveRate: 1, collectedAt: new Date() }; }
type AccountContext = { readonly service: ReturnType<typeof createTargetAccountService> };
