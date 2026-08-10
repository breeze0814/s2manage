import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectNewApiSourceRates,
  collectSub2ApiSourceRates,
  resolveSub2ApiAuthSession,
} from "../src/adapters/source-rate-client.ts";
import {
  getNewApiSourceAccount,
  getSub2ApiSourceAccount,
} from "../src/adapters/source-account-client.ts";
import { json, readJson, withServer, type RouteHandler } from "./remote-test-support.ts";

test("collectSub2ApiSourceRates reads available groups and user rates", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer token-a");
    if (request.method === "GET" && request.url === "/api/v1/groups/available") {
      json(response, {
        code: 0,
        data: [
          { id: "vip", name: "VIP", platform: "openai", rate_multiplier: 2 },
          { id: "std", name: "标准", platform: "openai", rate_multiplier: 1 },
        ],
      });
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: { vip: 1.5 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectSub2ApiSourceRates({
      sourceSiteId: 7,
      baseUrl,
      accessToken: "token-a",
      rechargeRatio: 2,
      targetRechargeRatio: 1,
    });

    assert.deepEqual(rates.map((rate) => ({
      sourceSiteId: rate.sourceSiteId,
      groupId: rate.groupId,
      groupName: rate.groupName,
      platform: rate.platform,
      rawRate: rate.rawRate,
      effectiveRate: rate.effectiveRate,
    })), [
      { sourceSiteId: 7, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: 1.5, effectiveRate: 0.75 },
      { sourceSiteId: 7, groupId: "std", groupName: "标准", platform: "openai", rawRate: 1, effectiveRate: 0.5 },
    ]);
  });
});

test("getSub2ApiSourceAccount reads source station balance", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer token-a");
    if (request.method === "GET" && request.url === "/api/v1/auth/me") {
      json(response, { code: 0, data: { email: "owner@example.com", balance: 123.45, total_recharged: 200 } });
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/usage/dashboard/stats") {
      json(response, { code: 0, data: { today_actual_cost: 4.5, total_actual_cost: 76.55 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const account = await getSub2ApiSourceAccount({
      sourceSiteId: 7,
      baseUrl,
      accessToken: "token-a",
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.deepEqual(account, {
      sourceSiteId: 7,
      label: "owner@example.com",
      balance: 123.45,
      todayConsume: 4.5,
      historyRecharge: 200,
    });
  });
});

test("getSub2ApiSourceAccount falls back to date-range usage stats", async () => {
  let fallbackUrl = "";
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer token-a");
    if (request.method === "GET" && request.url === "/api/v1/auth/me") {
      json(response, { code: 0, data: { email: "owner@example.com", balance: 123.45 } });
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/usage/dashboard/stats") {
      json(response, { code: 1, message: "接口不存在" }, 404);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/v1/usage/stats?")) {
      fallbackUrl = request.url;
      json(response, { code: 0, data: { total_actual_cost: 3.375376448 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const account = await getSub2ApiSourceAccount({
      sourceSiteId: 7,
      baseUrl,
      accessToken: "token-a",
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    const query = new URL(`http://127.0.0.1${fallbackUrl}`).searchParams;
    assert.equal(query.get("timezone"), "Asia/Shanghai");
    assert.match(query.get("start_date") ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(query.get("end_date") ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(account.todayConsume, 3.375376448);
    assert.equal(account.balance, 123.45);
  });
});

test("getSub2ApiSourceAccount keeps auth/me balance when usage endpoints fail", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer token-a");
    if (request.method === "GET" && request.url === "/api/v1/auth/me") {
      json(response, { code: 0, data: { email: "owner@example.com", balance: 123.45 } });
      return;
    }
    json(response, { code: 1, message: "接口不存在" }, 404);
  }, async (baseUrl) => {
    const account = await getSub2ApiSourceAccount({
      sourceSiteId: 7,
      baseUrl,
      accessToken: "token-a",
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.equal(account.balance, 123.45);
    assert.equal(account.todayConsume, null);
  });
});

test("collectSub2ApiSourceRates logs in with email and password", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/v1/auth/login") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.deepEqual(body, { email: "owner@example.com", password: "secret-pass" });
      json(response, { code: 0, data: { access_token: "login-token" } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer login-token");
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "std", name: "标准", rate_multiplier: 1.2 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: {} });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectSub2ApiSourceRates({
      sourceSiteId: 8,
      baseUrl,
      auth: {
        mode: "password",
        username: "owner@example.com",
        password: "secret-pass",
      },
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.equal(rates[0]?.effectiveRate, 1.2);
  });
});

test("collectSub2ApiSourceRates refreshes access token with rtToken", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/v1/auth/refresh") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.deepEqual(body, { refresh_token: "refresh-token-a" });
      json(response, { code: 0, data: { access_token: "refreshed-token" } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer refreshed-token");
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "std", name: "标准", rate_multiplier: 1.4 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: {} });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectSub2ApiSourceRates({
      sourceSiteId: 13,
      baseUrl,
      auth: {
        mode: "manual_token",
        accessToken: "",
        rtToken: "refresh-token-a",
      },
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.equal(rates[0]?.effectiveRate, 1.4);
  });
});

test("target recharge ratio maps group rates from the source recharge ratio", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/pricing") {
      json(response, { success: true, group_ratio: { default: 1 }, usable_group: { default: "默认" } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectNewApiSourceRates({
      sourceSiteId: 11,
      baseUrl,
      accessToken: "new-token",
      rechargeRatio: 1,
      targetRechargeRatio: 10,
    });

    assert.equal(rates[0]?.effectiveRate, 10);
  });
});

test("Sub2API authentication retains rotated access and refresh tokens", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.url, "/api/v1/auth/refresh");
    assert.deepEqual(await readJson(request), { refresh_token: "refresh-token-a" });
    json(response, { code: 0, data: { access_token: "access-token-b", refresh_token: "refresh-token-b" } });
  }, async (baseUrl) => {
    const session = await resolveSub2ApiAuthSession({
      sourceSiteId: 14,
      baseUrl,
      auth: { mode: "manual_token", accessToken: "", rtToken: "refresh-token-a" },
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });
    assert.deepEqual(session, { accessToken: "access-token-b", refreshToken: "refresh-token-b" });
  });
});

test("collectNewApiSourceRates reads pricing group ratios", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer new-token");
    assert.equal(request.headers["new-api-user"], "4465");
    if (request.method === "GET" && request.url === "/api/pricing") {
      json(response, {
        success: true,
        group_ratio: { default: 1, pro: 1.8 },
        usable_group: { default: "默认", pro: "专业" },
      });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectNewApiSourceRates({
      sourceSiteId: 9,
      baseUrl,
      accessToken: "new-token",
      newApiUserId: "4465",
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.deepEqual(rates.map((rate) => ({
      sourceSiteId: rate.sourceSiteId,
      groupId: rate.groupId,
      groupName: rate.groupName,
      platform: rate.platform,
      rawRate: rate.rawRate,
      effectiveRate: rate.effectiveRate,
    })), [
      { sourceSiteId: 9, groupId: "default", groupName: "默认", platform: "new-api", rawRate: 1, effectiveRate: 1 },
      { sourceSiteId: 9, groupId: "pro", groupName: "专业", platform: "new-api", rawRate: 1.8, effectiveRate: 1.8 },
    ]);
  });
});

test("getNewApiSourceAccount reads NewAPI quota as balance", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer new-token");
    if (request.method === "GET" && request.url === "/api/user/self") {
      json(response, { success: true, data: { username: "new-user", quota: 1000000, used_quota: 500000 } });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/log/self/stat?")) {
      json(response, { success: true, data: { quota: 250000 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const account = await getNewApiSourceAccount({
      sourceSiteId: 9,
      baseUrl,
      accessToken: "new-token",
      rechargeRatio: 1,
      targetRechargeRatio: 1,
    });

    assert.deepEqual(account, {
      sourceSiteId: 9,
      label: "new-user",
      balance: 2,
      todayConsume: 0.5,
      historyRecharge: 3,
    });
  });
});

test("collectNewApiSourceRates logs in with username and password", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/user/login") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.deepEqual(body, { username: "new-user", password: "new-pass" });
      json(response, { success: true, data: { token: "new-login-token" } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer new-login-token");
    if (request.method === "GET" && request.url === "/api/pricing") {
      json(response, {
        success: true,
        group_ratio: { default: 1.6 },
        usable_group: { default: "默认" },
      });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const rates = await collectNewApiSourceRates({
      sourceSiteId: 10,
      baseUrl,
      auth: {
        mode: "password",
        username: "new-user",
        password: "new-pass",
      },
      rechargeRatio: 2,
      targetRechargeRatio: 1,
    });

    assert.equal(rates[0]?.effectiveRate, 0.8);
  });
});
