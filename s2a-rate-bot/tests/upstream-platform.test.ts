import assert from "node:assert/strict";
import { test } from "node:test";
import { createJsonHttpClient } from "../src/adapters/http-client.ts";
import {
  createNewApiClient,
  createSub2ApiClient,
  newApiSessionFromKey,
  sub2ApiSessionFromAdminKey,
  sub2ApiSessionFromToken,
} from "../src/server/upstream-platform/client.ts";
import { UpstreamProtocolError } from "../src/server/upstream-platform/types.ts";
import { json, readJson, withServer } from "./remote-test-support.ts";

const http = () => createJsonHttpClient({ timeoutMs: 2_000, proxyUrl: null });

test("New API login preserves Cookie/UserID auth and reads quota_per_unit", async () => {
  await withServer(async (request, response) => {
    if (request.url === "/api/user/login") {
      assert.deepEqual(await readJson(request), { username: "root", password: "secret" });
      response.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": ["session=abc; Path=/; HttpOnly", "theme=dark; Path=/"],
      });
      response.end(JSON.stringify({ success: true, data: { id: 42 } }));
      return;
    }
    assert.equal(request.headers.cookie, "session=abc; theme=dark");
    assert.equal(request.headers["new-api-user"], "42");
    json(response, { data: { quota_per_unit: 750_000 } });
  }, async (baseUrl) => {
    const session = await createNewApiClient({ baseUrl, http: http() }).login("root", "secret");
    assert.equal(session.userId, "42");
    assert.equal(session.quotaPerUnit, 750_000);
  });
});

test("New API clones token creation, exact-name lookup and key retrieval", async () => {
  const calls: string[] = [];
  await withServer(async (request, response) => {
    calls.push(`${request.method} ${request.url}`);
    assert.equal(request.headers.authorization, "Bearer access-key");
    assert.equal(request.headers["new-api-user"], "9");
    if (request.method === "POST" && request.url === "/api/token/") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.equal(body.name, "ticket-token");
      assert.equal(body.unlimited_quota, true);
      assert.equal(body.group, "vip");
      json(response, { success: true });
      return;
    }
    if (request.method === "GET" && request.url === "/api/token/?p=1&page_size=100") {
      json(response, { data: [{ id: 71, name: "ticket-token", group: "vip" }], total: 1 });
      return;
    }
    if (request.method === "POST" && request.url === "/api/token/71/key") {
      json(response, { data: { key: "sk-full" } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (baseUrl) => {
    const session = newApiSessionFromKey(baseUrl, "9", "access-key");
    const result = await createNewApiClient({ baseUrl, http: http(), session }).createToken("ticket-token", "vip");
    assert.deepEqual(result, { id: "71", key: "sk-full" });
    assert.deepEqual(calls, ["POST /api/token/", "GET /api/token/?p=1&page_size=100", "POST /api/token/71/key"]);
  });
});

test("New API channel search falls back to exact local group filtering", async () => {
  await withServer((request, response) => {
    if (request.url?.startsWith("/api/channel/search?")) {
      json(response, { message: "unsupported" }, 404);
      return;
    }
    json(response, {
      data: [
        { id: 1, name: "vip", group: "default, vip", base_url: "https://one.example", weight: 10 },
        { id: 2, name: "vip2", group: "vip2", base_url: "https://two.example", weight: 10 },
      ],
      total: 2,
    });
  }, async (baseUrl) => {
    const session = newApiSessionFromKey(baseUrl, "9", "access-key");
    const channels = await createNewApiClient({ baseUrl, http: http(), session }).listGroupChannels("vip");
    assert.deepEqual(channels.map((channel) => channel.id), ["1"]);
  });
});

test("New API channel updates GET then PUT a top-level merged payload", async () => {
  let update: Record<string, unknown> | null = null;
  await withServer(async (request, response) => {
    if (request.method === "GET") {
      json(response, { data: { id: 5, name: "channel", key: "secret", group: "default", status: 1, weight: 20 } });
      return;
    }
    update = await readJson(request) as Record<string, unknown>;
    json(response, { success: true });
  }, async (baseUrl) => {
    const session = newApiSessionFromKey(baseUrl, "9", "access-key");
    await createNewApiClient({ baseUrl, http: http(), session }).updateChannelWeightStatus("5", { weight: 0, status: 2 });
  });
  assert.deepEqual(update, { id: 5, key: "secret", name: "channel", group: "default", status: 2, weight: 0 });
});

test("New API parses admin group names and filters user balances", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/group/") {
      json(response, { data: ["default", "vip"] });
      return;
    }
    if (request.url === "/api/user/self/groups") {
      json(response, { data: { group_ratio: { default: 1, vip: 1.5 }, usable_group: { default: "默认", vip: "VIP" } } });
      return;
    }
    if (request.url === "/api/pricing") {
      json(response, { group_ratio: { default: 1, vip: 1.5 }, usable_group: { default: "默认", vip: "VIP" } });
      return;
    }
    json(response, { data: { items: [{ id: 1, role: 10, quota: 9_000_000 }, { id: 2, role: 1, quota: 1_000_000 }], total: 2 } });
  }, async (baseUrl) => {
    const session = { ...newApiSessionFromKey(baseUrl, "9", "access-key"), quotaPerUnit: 500_000 };
    const client = createNewApiClient({ baseUrl, http: http(), session });
    const groups = await client.fetchAdminAllGroups();
    assert.deepEqual(groups.map((group) => ({ id: group.id, name: group.name, multiplier: group.multiplier })), [
      { id: "default", name: "default", multiplier: 1 },
      { id: "vip", name: "vip", multiplier: 1.5 },
    ]);
    assert.equal(await client.fetchAdminSiteBalance(), 2);
  });
});

test("Sub2API login and current-user lookup use the user Bearer token", async () => {
  await withServer(async (request, response) => {
    if (request.url === "/api/v1/auth/login") {
      assert.deepEqual(await readJson(request), { email: "admin@example.com", password: "secret" });
      json(response, { data: { access_token: "jwt", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer jwt");
    json(response, { data: { user_id: 88, email: "admin@example.com", role: "admin" } });
  }, async (baseUrl) => {
    const session = await createSub2ApiClient({ baseUrl, http: http() }).login("admin@example.com", "secret");
    const user = await createSub2ApiClient({ baseUrl, http: http(), session }).fetchCurrentUser();
    assert.deepEqual({ id: user.id, email: user.email, role: user.role }, { id: "88", email: "admin@example.com", role: "admin" });
  });
});

test("Sub2API refresh-token-only sessions can obtain a new access token", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.url, "/api/v1/auth/refresh");
    assert.deepEqual(await readJson(request), { refresh_token: "refresh-only" });
    json(response, { data: { access_token: "rotated", refresh_token: "next-refresh", token_type: "Bearer" } });
  }, async (baseUrl) => {
    const session = sub2ApiSessionFromToken(baseUrl, { refreshToken: "refresh-only" });
    const refreshed = await createSub2ApiClient({ baseUrl, http: http(), session }).refresh();
    assert.equal(refreshed.accessToken, "rotated");
    assert.equal(refreshed.refreshToken, "next-refresh");
  });
});

test("Sub2API admin operations use x-api-key and field-level bulk update", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  await withServer(async (request, response) => {
    assert.equal(request.headers["x-api-key"], "admin-key");
    const body = request.method === "POST" ? await readJson(request) : null;
    calls.push({ url: request.url ?? "", body });
    if (request.url?.startsWith("/api/v1/admin/accounts?")) {
      json(response, { data: { items: [{ id: 4, name: "relay", group_ids: [7], schedulable: true }], total: 1 } });
      return;
    }
    json(response, { success: true });
  }, async (baseUrl) => {
    const session = sub2ApiSessionFromAdminKey(baseUrl, "admin-key");
    const client = createSub2ApiClient({ baseUrl, http: http(), session });
    const accounts = await client.listGroupAccounts("7");
    assert.equal(accounts[0]?.name, "relay");
    await client.updateAdminAccount("4", { priority: 12 });
  });
  assert.deepEqual(calls[1], {
    url: "/api/v1/admin/accounts/bulk-update",
    body: { account_ids: [4], priority: 12 },
  });
});

test("Sub2API optional group rates fail open to available groups", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer jwt");
    if (request.url === "/api/v1/groups/rates") {
      json(response, { message: "not supported" }, 404);
      return;
    }
    json(response, { data: [{ id: 7, name: "default", rate_multiplier: 1 }] });
  }, async (baseUrl) => {
    const session = {
      platform: "sub2api" as const, baseUrl, accessToken: "jwt", tokenType: "Bearer",
    };
    const result = await createSub2ApiClient({ baseUrl, http: http(), session }).fetchAvailableGroups();
    assert.equal(result.available.length, 1);
    assert.deepEqual(result.rates, []);
  });
});

test("Sub2API bulk-update capability errors remain distinguishable", async () => {
  await withServer((_request, response) => json(response, { message: "missing" }, 404), async (baseUrl) => {
    const session = sub2ApiSessionFromAdminKey(baseUrl, "admin-key");
    await assert.rejects(
      createSub2ApiClient({ baseUrl, http: http(), session }).updateAdminAccount("4", { status: "inactive" }),
      (error: unknown) => error instanceof UpstreamProtocolError && error.code === "unsupported",
    );
  });
});
