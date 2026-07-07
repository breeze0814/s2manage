import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { createHandler } from "../src/api/server.ts";
import { createSqliteAppStorage } from "../src/storage/sqlite-app-storage.ts";
import type { RuntimeConfig } from "../src/shared/config.ts";

type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void;

function json(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function withServer<T>(handler: RouteHandler, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("test server did not bind");
  try {
    return await task(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withTempDatabase<T>(task: (config: RuntimeConfig) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "s2a-rate-bot-"));
  try {
    return await task({ port: 0, host: "127.0.0.1", databaseUrl: `file:${join(dir, "app.db")}`, proxyUrl: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function requestJson(baseUrl: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

function sourceRoutes(request: IncomingMessage, response: ServerResponse) {
  assert.equal(request.headers.authorization, "Bearer source-token");
  if (request.url === "/api/v1/auth/me") {
    json(response, { code: 0, data: { email: "source@example.com", balance: 88 } });
    return;
  }
  if (request.url === "/api/v1/groups/available") {
    json(response, { code: 0, data: [{ id: "vip", name: "VIP", platform: "openai", rate_multiplier: 2 }] });
    return;
  }
  if (request.url === "/api/v1/groups/rates") {
    json(response, { code: 0, data: {} });
    return;
  }
  json(response, { message: "not found" }, 404);
}

test("settings and source overview survive a new API handler through the database", async () => {
  await withTempDatabase(async (config) => {
    await withServer(sourceRoutes, async (sourceBaseUrl) => {
      await withServer(createHandler(config), async (apiBaseUrl) => {
        await requestJson(apiBaseUrl, "/api/settings/target", {
          name: "主站",
          baseUrl: "https://target.example.com",
          adminApiKey: "target-key",
        });
        await requestJson(apiBaseUrl, "/api/settings/bot", {
          enabled: true,
          wsUrl: "ws://127.0.0.1:3001",
          token: "bot-token",
          targetGroupId: "9001",
          mentionCommandEnabled: false,
          commandSettings: {
            help: true,
            rate: false,
            bind: true,
            unbind: true,
            inviteHelp: true,
            inviteMine: false,
            inviteLeaderboard: true,
          },
          activePrivateMessageEnabled: false,
          scheduledStatsEnabled: true,
          inviteActivityStartDate: "2026-07-07",
          inviteActivityActiveRewardAmount: 10,
          inviteActivityInactiveRewardAmount: 2,
          botUserId: "12345",
        });
        await requestJson(apiBaseUrl, "/api/settings/proxy", {
          enabled: true,
          httpProxy: "http://127.0.0.1:7890",
          httpsProxy: "http://127.0.0.1:7891",
        });
        await requestJson(apiBaseUrl, "/api/settings/worker", {
          intervalSeconds: 180,
        });
        await requestJson(apiBaseUrl, "/api/source/overview", {
          sourceSiteId: 1,
          name: "采集站 A",
          siteType: "sub2api",
          baseUrl: sourceBaseUrl,
          authMode: "manual_token",
          accessToken: "source-token",
          rechargeRatio: 1,
          intervalSeconds: 3600,
          useProxy: false,
        });
        await requestJson(apiBaseUrl, "/api/groups/rule", {
          targetGroupId: 5,
          targetGroupName: "VIP",
          currentRate: 1.2,
          enabled: true,
          mode: "avg_formula",
          offset: 0.1,
          multiplier: 2,
          formula: "10*avg",
          sourceGroupIds: ["vip", "plus"],
        });
      });

      await withServer(createHandler(config), async (apiBaseUrl) => {
        const configPayload = await requestJson(apiBaseUrl, "/api/app-config");
        assert.deepEqual(configPayload.target, {
          name: "主站",
          baseUrl: "https://target.example.com",
          adminApiKey: "",
          adminApiKeySet: true,
        });
        assert.deepEqual(configPayload.bot, {
          enabled: true,
          wsUrl: "ws://127.0.0.1:3001",
          token: "",
          tokenSet: true,
          targetGroupId: "9001",
          mentionCommandEnabled: false,
          commandSettings: {
            help: true,
            rate: false,
            bind: true,
            unbind: true,
            inviteHelp: true,
            inviteMine: false,
            inviteLeaderboard: true,
          },
          activePrivateMessageEnabled: false,
          scheduledStatsEnabled: true,
          inviteActivityStartDate: "2026-07-07",
          inviteActivityActiveRewardAmount: 10,
          inviteActivityInactiveRewardAmount: 2,
          botUserId: "12345",
        });
        assert.deepEqual(configPayload.proxy, {
          enabled: true,
          httpProxy: "http://127.0.0.1:7890",
          httpsProxy: "http://127.0.0.1:7891",
        });
        assert.deepEqual(configPayload.worker, {
          intervalSeconds: 180,
        });

        const sources = configPayload.sources as Array<Record<string, unknown>>;
        assert.equal(sources.length, 1);
        assert.equal(sources[0]?.name, "采集站 A");
        assert.equal(sources[0]?.accessToken, "");
        assert.equal(sources[0]?.accessTokenSet, true);
        assert.equal(sources[0]?.rtTokenSet, false);
        assert.equal(sources[0]?.passwordSet, false);
        assert.deepEqual(sources[0]?.account, { sourceSiteId: 1, label: "source@example.com", balance: 88 });
        assert.deepEqual((sources[0]?.rates as Array<Record<string, unknown>>).map((rate) => ({
          groupId: rate.groupId,
          groupName: rate.groupName,
          platform: rate.platform,
          effectiveRate: rate.effectiveRate,
        })), [{ groupId: "vip", groupName: "VIP", platform: "openai", effectiveRate: 2 }]);

        assert.deepEqual(configPayload.groupRules, [{
          targetGroupId: 5,
          targetGroupName: "VIP",
          currentRate: 1.2,
          enabled: true,
          mode: "avg_formula",
          offset: 0.1,
          multiplier: 2,
          formula: "10*avg",
          sourceGroupIds: ["vip", "plus"],
        }]);
      });
    });
  });
});

test("bot ability settings endpoints update only their own section", async () => {
  await withTempDatabase(async (config) => {
    await withServer(createHandler(config), async (apiBaseUrl) => {
      await requestJson(apiBaseUrl, "/api/settings/bot", {
        enabled: true,
        wsUrl: "ws://127.0.0.1:3001",
        token: "bot-token",
        targetGroupId: "9001",
        mentionCommandEnabled: true,
        commandSettings: {
          help: true,
          rate: true,
          bind: true,
          unbind: true,
          inviteHelp: true,
          inviteMine: true,
          inviteLeaderboard: true,
        },
        activePrivateMessageEnabled: true,
        scheduledStatsEnabled: true,
        inviteActivityStartDate: "2026-07-07",
        inviteActivityActiveRewardAmount: 10,
        inviteActivityInactiveRewardAmount: 2,
        botUserId: "12345",
      });

      await requestJson(apiBaseUrl, "/api/settings/bot/commands", {
        mentionCommandEnabled: false,
        commandSettings: {
          help: false,
          rate: true,
          bind: false,
          unbind: true,
          inviteHelp: true,
          inviteMine: false,
          inviteLeaderboard: true,
        },
      });

      let configPayload = await requestJson(apiBaseUrl, "/api/app-config");
      assert.equal((configPayload.bot as Record<string, unknown>).enabled, true);
      assert.equal((configPayload.bot as Record<string, unknown>).wsUrl, "ws://127.0.0.1:3001");
      assert.equal((configPayload.bot as Record<string, unknown>).tokenSet, true);
      assert.equal((configPayload.bot as Record<string, unknown>).mentionCommandEnabled, false);
      assert.deepEqual((configPayload.bot as Record<string, unknown>).commandSettings, {
        help: false,
        rate: true,
        bind: false,
        unbind: true,
        inviteHelp: true,
        inviteMine: false,
        inviteLeaderboard: true,
      });

      await requestJson(apiBaseUrl, "/api/settings/bot/invite-activity", {
        scheduledStatsEnabled: false,
        inviteActivityStartDate: "2026-07-10",
        inviteActivityActiveRewardAmount: 20,
        inviteActivityInactiveRewardAmount: 3,
      });

      configPayload = await requestJson(apiBaseUrl, "/api/app-config");
      assert.equal((configPayload.bot as Record<string, unknown>).activePrivateMessageEnabled, true);
      assert.equal((configPayload.bot as Record<string, unknown>).scheduledStatsEnabled, false);
      assert.equal((configPayload.bot as Record<string, unknown>).inviteActivityStartDate, "2026-07-10");
      assert.equal((configPayload.bot as Record<string, unknown>).inviteActivityActiveRewardAmount, 20);
      assert.equal((configPayload.bot as Record<string, unknown>).inviteActivityInactiveRewardAmount, 3);

      await requestJson(apiBaseUrl, "/api/settings/bot/connection", {
        enabled: true,
        wsUrl: "ws://127.0.0.1:3001",
        token: "",
        clearToken: true,
        targetGroupId: "9001",
        botUserId: "12345",
      });

      configPayload = await requestJson(apiBaseUrl, "/api/app-config");
      assert.equal((configPayload.bot as Record<string, unknown>).tokenSet, false);
    });
  });
});

test("runtime events are exposed through the API", async () => {
  await withTempDatabase(async (config) => {
    const storage = createSqliteAppStorage(config.databaseUrl ?? "");
    await storage.recordRuntimeEvent({
      service: "bot",
      eventType: "napcat-connected",
      status: "success",
      message: "NapCat connected",
    });
    storage.close();

    await withServer(createHandler(config), async (apiBaseUrl) => {
      const payload = await requestJson(apiBaseUrl, "/api/runtime/events");
      const events = payload.events as Array<Record<string, unknown>>;
      assert.equal(events[0]?.service, "bot");
      assert.equal(events[0]?.eventType, "napcat-connected");
      assert.equal(events[0]?.status, "success");
    });
  });
});
