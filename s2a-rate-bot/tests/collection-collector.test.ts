import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultCollectionCollector } from "../src/server/collection/collector.ts";
import type { CollectionSiteRuntime } from "../src/server/collection/types.ts";
import { json, withServer } from "./remote-test-support.ts";

test("collector keeps rates when account APIs fail", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "vip", name: "VIP", rate_multiplier: 2 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: {} });
      return;
    }
    json(response, { message: "account unavailable" }, 503);
  }, async (baseUrl) => {
    const overview = await createDefaultCollectionCollector().collect({
      site: runtimeSite(baseUrl), timeoutMs: 2_000, proxyUrl: null, targetRechargeRatio: 1,
    });
    assert.equal(overview.account, null);
    assert.equal(overview.rates?.[0]?.groupId, "vip");
    assert.match(overview.errors.join("\n"), /账户信息接口/);
  });
});

test("collector fails explicitly when account and rate APIs all fail", async () => {
  await withServer((_request, response) => {
    json(response, { message: "upstream unavailable" }, 503);
  }, async (baseUrl) => {
    await assert.rejects(createDefaultCollectionCollector().collect({
      site: runtimeSite(baseUrl), timeoutMs: 2_000, proxyUrl: null, targetRechargeRatio: 1,
    }), /采集站数据接口全部失败/);
  });
});

function runtimeSite(baseUrl: string): CollectionSiteRuntime {
  return {
    id: 1, name: "Source", remark: "", siteType: "sub2api", baseUrl, websiteUrl: "",
    authMode: "manual_token", username: "", newApiUserId: "", password: "",
    accessToken: "token-a", refreshToken: "", rechargeRatio: 1, balanceAlertThreshold: null,
    intervalSeconds: 600, useProxy: false, enabled: true, accountLabel: null, balance: null,
    todayConsume: null, historyRecharge: null, lastRunAt: null, lastSuccessAt: null,
    lastStatus: null, lastError: null, consecutiveFailures: 0, refreshVersion: 0,
  };
}
