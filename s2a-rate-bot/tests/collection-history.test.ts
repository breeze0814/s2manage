import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TARGET_RULE_VERSION } from "../src/core/rule-version.ts";
import { createSqliteCollectionStore } from "../src/server/collection/store.ts";
import { createSqliteConnectionStore } from "../src/server/connections/store.ts";
import { createSqliteTargetGroupStore } from "../src/server/target-groups/store.ts";
import { insertActiveConnection } from "./real-connection-test-support.ts";

test("collection history filters runs and rate changes by source group", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-history-"));
  const store = createSqliteCollectionStore(`file:${join(directory, "app.db")}`);
  try {
    const site = store.create(siteInput());
    assert.equal(site.remark, "Main");
    assert.equal(site.balanceAlertThreshold, 5);
    recordSuccess(store, site.id, [rate(site.id, "vip", 2), rate(site.id, "legacy", 3)]);
    recordSuccess(store, site.id, [rate(site.id, "vip", 2.5)]);

    const vipChanges = store.changes({ siteId: site.id, groupId: "vip" });
    const deleted = store.changes({ siteId: site.id, changeType: "deleted" });
    const runs = store.runs({ siteId: site.id, status: "success" });

    assert.deepEqual(vipChanges.map((change) => change.changeType), ["updated", "added"]);
    assert.deepEqual(deleted.map((change) => change.groupId), ["legacy"]);
    assert.equal(runs.length, 2);
    assert.equal(runs.every((run) => run.sourceSiteName === "Source" && run.durationMs >= 0), true);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rate catalog exposes mapping state, deltas, and deleted groups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-catalog-"));
  const databaseUrl = `file:${join(directory, "app.db")}`;
  const store = createSqliteCollectionStore(databaseUrl);
  const targetStore = createSqliteTargetGroupStore(databaseUrl);
  const connectionStore = createSqliteConnectionStore(databaseUrl);
  try {
    const site = store.create(siteInput());
    recordSuccess(store, site.id, [rate(site.id, "vip", 2), rate(site.id, "legacy", 3)]);
    recordSuccess(store, site.id, [rate(site.id, "vip", 2.5)]);
    targetStore.saveRule(targetRule(), [{ sourceSiteId: site.id, sourceGroupId: "vip" }]);
    store.setRateGroupType(site.id, "vip", "openai");
    insertActiveConnection(connectionStore, site.id);

    const catalog = store.catalog(site.id);
    const current = store.rates(site.id);
    const vip = catalog.find((item) => item.groupId === "vip");
    const legacy = catalog.find((item) => item.groupId === "legacy");

    assert.equal(current.length, 1);
    assert.deepEqual(
      {
        mappingStatus: vip?.mappingStatus, delta: vip?.delta, deltaPercent: vip?.deltaPercent,
        groupType: vip?.groupType, connected: vip?.connected, pricingMapped: vip?.pricingMapped,
      },
      { mappingStatus: "mapped", delta: 0.5, deltaPercent: 25, groupType: "openai", connected: true, pricingMapped: true },
    );
    assert.deepEqual(
      { deleted: legacy?.deleted, mappingStatus: legacy?.mappingStatus, effectiveRate: legacy?.effectiveRate },
      { deleted: true, mappingStatus: "unmapped", effectiveRate: 3 },
    );
  } finally {
    connectionStore.close();
    targetStore.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function recordSuccess(store: ReturnType<typeof createSqliteCollectionStore>, siteId: number, rates: ReturnType<typeof rate>[]) {
  const startedAt = new Date().toISOString();
  store.recordSuccess({
    siteId,
    refreshVersion: store.beginRefresh(siteId),
    overview: { account: { sourceSiteId: siteId, label: "user", balance: 10, todayConsume: 1, historyRecharge: 20 }, rates, errors: [] },
    startedAt,
  });
}

function rate(siteId: number, groupId: string, effectiveRate: number) {
  return { sourceSiteId: siteId, groupId, groupName: groupId, platform: "openai", rawRate: effectiveRate, effectiveRate, collectedAt: new Date() };
}

function siteInput() {
  return {
    name: "Source", remark: "Main", siteType: "sub2api" as const, baseUrl: "https://example.com", websiteUrl: "",
    authMode: "password" as const, username: "user", newApiUserId: "", passwordEnc: "enc", accessTokenEnc: "enc",
    refreshTokenEnc: "enc", rechargeRatio: 1, balanceAlertThreshold: 5, intervalSeconds: 600, useProxy: false, enabled: true,
  };
}

function targetRule() {
  return {
    targetGroupId: 7, targetGroupName: "Target VIP", enabled: true, ruleVersion: TARGET_RULE_VERSION,
    ruleType: "first" as const, parameters: { adjustmentMode: "fixed" as const, adjustmentValue: 0, minimum: 0, formula: "" },
    currentRate: null, lastAppliedFromRate: null, lastAppliedToRate: null, lastAppliedAt: null, lastError: null,
  };
}
