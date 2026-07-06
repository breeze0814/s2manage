import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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

async function requestJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

test("POST /api/groups/apply-rule computes target rate from saved source groups", async () => {
  await withTempDatabase(async (config) => {
    await withServer(targetRoutes, async (targetBaseUrl) => {
      await withServer(sourceRoutes, async (sourceBaseUrl) => {
        await withServer(createHandler(config), async (apiBaseUrl) => {
          await requestJson(apiBaseUrl, "/api/source/overview", sourceOverviewBody(sourceBaseUrl));
          const payload = await requestJson(apiBaseUrl, "/api/groups/apply-rule", applyRuleBody(targetBaseUrl));
          assert.deepEqual(payload.rule, expectedRule());
          assert.deepEqual(payload.group, { id: 5, name: "VIP", status: "active", rate_multiplier: 4.1 });
        });
      });
    });
  });
});

async function targetRoutes(request: IncomingMessage, response: ServerResponse) {
  assert.equal(request.headers["x-api-key"], "target-key");
  assert.equal(request.url, "/api/v1/admin/groups/5");
  const body = await readJson(request) as Record<string, unknown>;
  assert.equal(body.rate_multiplier, 4.1);
  json(response, { data: { id: 5, name: "VIP", status: "active", rate_multiplier: 4.1 } });
}

function sourceRoutes(request: IncomingMessage, response: ServerResponse) {
  assert.equal(request.headers.authorization, "Bearer source-token");
  if (request.url === "/api/v1/auth/me") json(response, { code: 0, data: { email: "source@example.com", balance: 88 } });
  else if (request.url === "/api/v1/groups/available") json(response, { code: 0, data: sourceGroups() });
  else if (request.url === "/api/v1/groups/rates") json(response, { code: 0, data: { std: 1.5 } });
  else json(response, { message: "not found" }, 404);
}

function sourceGroups() {
  return [
    { id: "vip", name: "VIP", platform: "openai", rate_multiplier: 2 },
    { id: "std", name: "STD", platform: "openai", rate_multiplier: 1 },
  ];
}

function sourceOverviewBody(sourceBaseUrl: string) {
  return { sourceSiteId: 1, name: "采集站 A", siteType: "sub2api", baseUrl: sourceBaseUrl, accessToken: "source-token", rechargeRatio: 1 };
}

function applyRuleBody(targetBaseUrl: string) {
  return {
    baseUrl: targetBaseUrl,
    adminApiKey: "target-key",
    targetGroupId: 5,
    targetGroupName: "VIP",
    currentRate: 1,
    enabled: true,
    mode: "max",
    offset: 0.1,
    multiplier: 2,
    sourceGroupIds: ["1:vip", "1:std"],
  };
}

function expectedRule() {
  return {
    targetGroupId: 5,
    targetGroupName: "VIP",
    currentRate: 4.1,
    enabled: true,
    mode: "max",
    offset: 0.1,
    multiplier: 2,
    formula: "avg",
    sourceGroupIds: ["1:vip", "1:std"],
  };
}
