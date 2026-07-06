import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { Sub2ApiAdminTarget } from "../src/adapters/sub2api-admin.ts";
import {
  collectNewApiSourceRates,
  collectSub2ApiSourceRates,
} from "../src/adapters/source-rate-client.ts";
import {
  getNewApiSourceAccount,
  getSub2ApiSourceAccount,
} from "../src/adapters/source-account-client.ts";

type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void;

function json(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as unknown : null;
}

async function withServer<T>(handler: RouteHandler, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await task(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Sub2ApiAdminTarget lists and updates target group rates", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.headers["x-api-key"], "secret");
    if (request.method === "GET" && request.url === "/api/v1/admin/groups/all") {
      json(response, { data: [{ id: 3, name: "标准", status: "active", rate_multiplier: 1.1 }] });
      return;
    }
    if (request.method === "PUT" && request.url === "/api/v1/admin/groups/3") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.equal(body.rate_multiplier, 1.23);
      json(response, { data: { id: 3, name: "标准", status: "active", rate_multiplier: 1.23 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const client = new Sub2ApiAdminTarget(baseUrl, "secret");
    const groups = await client.listGroups();
    assert.deepEqual(groups, [{ id: 3, name: "标准", status: "active", rate_multiplier: 1.1 }]);

    const updated = await client.updateGroupRateMultiplier(3, 1.234);
    assert.equal(updated.rate_multiplier, 1.23);
  });
});

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
      json(response, { code: 0, data: { email: "owner@example.com", balance: 123.45 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const account = await getSub2ApiSourceAccount({
      sourceSiteId: 7,
      baseUrl,
      accessToken: "token-a",
      rechargeRatio: 1,
    });

    assert.deepEqual(account, {
      sourceSiteId: 7,
      label: "owner@example.com",
      balance: 123.45,
    });
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
    });

    assert.equal(rates[0]?.effectiveRate, 1.4);
  });
});

test("collectNewApiSourceRates reads pricing group ratios", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer new-token");
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
      rechargeRatio: 1,
    });

    assert.deepEqual(rates.map((rate) => ({
      sourceSiteId: rate.sourceSiteId,
      groupId: rate.groupId,
      groupName: rate.groupName,
      rawRate: rate.rawRate,
      effectiveRate: rate.effectiveRate,
    })), [
      { sourceSiteId: 9, groupId: "default", groupName: "默认", rawRate: 1, effectiveRate: 1 },
      { sourceSiteId: 9, groupId: "pro", groupName: "专业", rawRate: 1.8, effectiveRate: 1.8 },
    ]);
  });
});

test("getNewApiSourceAccount reads NewAPI quota as balance", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer new-token");
    if (request.method === "GET" && request.url === "/api/user/self") {
      json(response, { success: true, data: { username: "new-user", quota: 1000000 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const account = await getNewApiSourceAccount({
      sourceSiteId: 9,
      baseUrl,
      accessToken: "new-token",
      rechargeRatio: 1,
    });

    assert.deepEqual(account, {
      sourceSiteId: 9,
      label: "new-user",
      balance: 2,
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
    });

    assert.equal(rates[0]?.effectiveRate, 0.8);
  });
});
