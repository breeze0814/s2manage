import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { createHandler } from "../src/api/server.ts";
import type { RuntimeConfig } from "../src/shared/config.ts";

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

function testConfig(): RuntimeConfig {
  return { port: 0, host: "127.0.0.1", databaseUrl: "file::memory:", proxyUrl: null };
}

test("POST /api/target/groups lists target station groups", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers["x-api-key"], "target-key");
    assert.equal(request.url, "/api/v1/admin/groups/all");
    json(response, { data: [{ id: 1, name: "标准", status: "active", rate_multiplier: 1 }] });
  }, async (targetBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/target/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: targetBaseUrl, adminApiKey: "target-key" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        groups: [{ id: 1, name: "标准", status: "active", rate_multiplier: 1 }],
      });
    });
  });
});

test("POST /api/target/group-rate updates target station group rate", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.headers["x-api-key"], "target-key");
    assert.equal(request.url, "/api/v1/admin/groups/5");
    const body = await readJson(request) as Record<string, unknown>;
    assert.equal(body.rate_multiplier, 1.35);
    json(response, { data: { id: 5, name: "VIP", status: "active", rate_multiplier: 1.35 } });
  }, async (targetBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/target/group-rate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: targetBaseUrl,
          adminApiKey: "target-key",
          groupId: 5,
          rateMultiplier: 1.345,
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        group: { id: 5, name: "VIP", status: "active", rate_multiplier: 1.35 },
      });
    });
  });
});

test("POST /api/source/rates collects source station rates", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer source-token");
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "vip", name: "VIP", platform: "openai", rate_multiplier: 2 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: { vip: 1.5 } });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (sourceBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/rates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSiteId: 11,
          siteType: "sub2api",
          baseUrl: sourceBaseUrl,
          accessToken: "source-token",
          rechargeRatio: 3,
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as { rates: Array<{ groupId: string; platform: string; effectiveRate: number }> };
      assert.deepEqual(payload.rates.map((rate) => ({
        groupId: rate.groupId,
        platform: rate.platform,
        effectiveRate: rate.effectiveRate,
      })), [{ groupId: "vip", platform: "openai", effectiveRate: 0.5 }]);
    });
  });
});

test("POST /api/source/rates accepts password auth for source station", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/v1/auth/login") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.equal(body.email, "source@example.com");
      assert.equal(body.password, "source-pass");
      json(response, { code: 0, data: { access_token: "source-login-token" } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer source-login-token");
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "vip", name: "VIP", platform: "openai", rate_multiplier: 2 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: {} });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (sourceBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/rates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSiteId: 12,
          siteType: "sub2api",
          baseUrl: sourceBaseUrl,
          authMode: "password",
          username: "source@example.com",
          password: "source-pass",
          rechargeRatio: 2,
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as { rates: Array<{ effectiveRate: number }> };
      assert.equal(payload.rates[0]?.effectiveRate, 1);
    });
  });
});

test("POST /api/source/rates accepts rtToken for Sub2API source station", async () => {
  await withServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/v1/auth/refresh") {
      const body = await readJson(request) as Record<string, unknown>;
      assert.equal(body.refresh_token, "rt-a");
      json(response, { code: 0, data: { access_token: "from-refresh" } });
      return;
    }
    assert.equal(request.headers.authorization, "Bearer from-refresh");
    if (request.url === "/api/v1/groups/available") {
      json(response, { code: 0, data: [{ id: "vip", name: "VIP", rate_multiplier: 2 }] });
      return;
    }
    if (request.url === "/api/v1/groups/rates") {
      json(response, { code: 0, data: {} });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (sourceBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/rates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSiteId: 14,
          siteType: "sub2api",
          baseUrl: sourceBaseUrl,
          authMode: "manual_token",
          accessToken: "",
          rtToken: "rt-a",
          rechargeRatio: 1,
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as { rates: Array<{ effectiveRate: number }> };
      assert.equal(payload.rates[0]?.effectiveRate, 2);
    });
  });
});

test("POST /api/source/overview returns source balance and group rates", async () => {
  await withServer((request, response) => {
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
  }, async (sourceBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/overview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSiteId: 15,
          siteType: "sub2api",
          baseUrl: sourceBaseUrl,
          accessToken: "source-token",
          rechargeRatio: 1,
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as {
        account: { sourceSiteId: number; label: string; balance: number };
        rates: Array<{
          groupId: string;
          groupName: string;
          platform: string;
          rawRate: number;
          effectiveRate: number;
          collectedAt: string;
        }>;
      };
      assert.deepEqual(payload.account, { sourceSiteId: 15, label: "source@example.com", balance: 88 });
      assert.deepEqual(payload.rates.map((rate) => ({
        groupId: rate.groupId,
        groupName: rate.groupName,
        platform: rate.platform,
        rawRate: rate.rawRate,
        effectiveRate: rate.effectiveRate,
      })), [{ groupId: "vip", groupName: "VIP", platform: "openai", rawRate: 2, effectiveRate: 2 }]);
      assert.match(payload.rates[0]?.collectedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

test("POST /api/bot/invite-activity returns invite activity leaderboard preview", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers["x-api-key"], "target-key");
    if (request.method === "GET" && request.url === "/api/v1/admin/settings") {
      json(response, { data: { affiliate_enabled: true } });
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/admin/affiliates/invites?page=1&page_size=20&search=&start_at=2026-07-07&end_at=2026-07-10") {
      json(response, {
        data: {
          items: [
            { inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 },
            { inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 102 },
          ],
          total: 2,
          page: 1,
          page_size: 20,
          pages: 1,
        },
      });
      return;
    }
    if (request.method === "GET" && request.url === "/api/v1/admin/users?page=1&page_size=100&status=&role=&search=") {
      json(response, {
        data: {
          items: [
            { id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-07T12:00:00+08:00" },
            { id: 102, email: "u102@example.com", balance: 0, last_used_at: null },
          ],
          total: 2,
          page: 1,
          page_size: 100,
          pages: 1,
        },
      });
      return;
    }
    json(response, { message: "not found" }, 404);
  }, async (targetBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/bot/invite-activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: targetBaseUrl,
          adminApiKey: "target-key",
          activityEnabled: true,
          startDate: "2026-07-07",
          activeRewardAmount: 10,
          inactiveRewardAmount: 2,
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as {
        summary: {
          affiliateEnabled: boolean;
          period: { startDate: string; endDate: string };
          periodInviteeCount: number;
          activeInviteeCount: number;
          inactiveInviteeCount: number;
          leaderboard: Array<{ inviterEmail: string; total: number; rewardAmount: number }>;
        };
        activityStatus: {
          currentPeriod: { startDate: string; endDate: string };
          settlementPeriod: { startDate: string; endDate: string } | null;
          nextSettlementDate: string;
        };
      };
      assert.equal(payload.summary.affiliateEnabled, true);
      assert.deepEqual({
        startDate: payload.summary.period.startDate,
        endDate: payload.summary.period.endDate,
      }, {
        startDate: "2026-07-07",
        endDate: "2026-07-10",
      });
      assert.equal(payload.summary.periodInviteeCount, 2);
      assert.equal(payload.summary.activeInviteeCount, 1);
      assert.equal(payload.summary.inactiveInviteeCount, 1);
      assert.deepEqual(payload.summary.leaderboard.map((entry) => ({
        inviterEmail: entry.inviterEmail,
        total: entry.total,
        rewardAmount: entry.rewardAmount,
      })), [{ inviterEmail: "a@example.com", total: 2, rewardAmount: 12 }]);
      assert.deepEqual(payload.activityStatus, {
        currentPeriod: { startDate: "2026-07-07", endDate: "2026-07-10" },
        settlementPeriod: null,
        nextSettlementDate: "2026-07-10",
      });
    });
  });
});

test("POST unknown API route returns JSON 404", async () => {
  await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
    const response = await fetch(`${apiBaseUrl}/api/source/missing`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await response.json(), { error: "api route not found" });
  });
});

test("POST /api/source/rates returns 400 for missing local credentials", async () => {
  await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
    const response = await fetch(`${apiBaseUrl}/api/source/rates`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sourceSiteId: 11,
        siteType: "sub2api",
        baseUrl: "https://source.example.com",
        authMode: "manual_token",
        accessToken: "",
        rtToken: "",
        rechargeRatio: 1,
      }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /accessToken|rtToken/);
  });
});

test("GET /api/status reports unconfigured bot as not configured", async () => {
  await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
    const response = await fetch(`${apiBaseUrl}/api/status`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { services: Array<{ name: string; state: string }> };
    const bot = payload.services.find((service) => service.name === "bot");
    assert.equal(bot?.state, "not_configured");
  });
});
