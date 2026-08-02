import assert from "node:assert/strict";
import { test } from "node:test";
import { collectNewApiSourceRates } from "../src/adapters/source-rate-client.ts";
import { getNewApiSourceAccount } from "../src/adapters/source-account-client.ts";
import { json, withServer } from "./remote-test-support.ts";

test("getNewApiSourceAccount falls back when subscription response has no balance", async () => {
  const requests: string[] = [];
  await withServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/api/subscription/self") {
      json(response, { success: true, data: { subscriptions: [] } });
      return;
    }
    if (request.url?.startsWith("/api/log/self/stat?")) {
      json(response, { success: true, data: { used_quota: 125000 } });
      return;
    }
    json(response, { success: true, data: { username: "fallback-user", quota: 750000, used_quota: 250000 } });
  }, async (baseUrl) => {
    const account = await getNewApiSourceAccount({
      sourceSiteId: 12, baseUrl, accessToken: "new-token",
      rechargeRatio: 1, targetRechargeRatio: 1,
    });
    assert.equal(requests.includes("/api/subscription/self"), true);
    assert.equal(requests.includes("/api/user/self"), true);
    assert.equal(requests.some((path) => path.startsWith("/api/log/self/stat?")), true);
    assert.equal(account.balance, 1.5);
    assert.equal(account.todayConsume, 0.25);
    assert.equal(account.historyRecharge, 2);
  });
});

test("New API password login supports session cookies and user id headers", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/user/login") {
      response.setHeader("set-cookie", "session=abc123; Path=/; HttpOnly");
      json(response, { success: true, data: { id: 88 } });
      return;
    }
    assert.equal(request.headers.cookie, "session=abc123");
    assert.equal(request.headers["new-api-user"], "88");
    json(response, { success: true, group_ratio: { default: 1 }, usable_group: { default: "默认" } });
  }, async (baseUrl) => {
    const rates = await collectNewApiSourceRates({
      sourceSiteId: 11, baseUrl,
      auth: { mode: "password", username: "new-user", password: "new-pass" },
      rechargeRatio: 1, targetRechargeRatio: 1,
    });
    assert.equal(rates.length, 1);
  });
});
