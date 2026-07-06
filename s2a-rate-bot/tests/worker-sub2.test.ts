import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSqliteAppStorage } from "../src/storage/sqlite-app-storage.ts";
import { runSub2WorkerCycle } from "../src/worker/sub2-cycle.ts";

type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

function json(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
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

async function withTempStorage<T>(task: (storage: ReturnType<typeof createSqliteAppStorage>) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "s2a-rate-bot-worker-"));
  const storage = createSqliteAppStorage(`file:${join(dir, "app.db")}`);
  try {
    return await task(storage);
  } finally {
    storage.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("sub2 worker cycle collects due source rates and updates target groups", async () => {
  await withServer(targetRoutes, async (targetBaseUrl) => {
    await withServer(sourceRoutes, async (sourceBaseUrl) => {
      await withTempStorage(async (storage) => {
        await seedStorage(storage, targetBaseUrl, sourceBaseUrl);
        const summary = await runSub2WorkerCycle({ storage });
        const config = await storage.getAppConfig();

        assert.equal(summary.collectedSources, 1);
        assert.equal(summary.updatedGroups, 1);
        assert.equal(config.sources[0]?.account?.balance, 88);
        assert.equal(config.sources[0]?.rates.length, 2);
        assert.equal(config.targetGroups[0]?.rate_multiplier, 4.1);
        assert.equal(config.groupRules[0]?.currentRate, 4.1);
      });
    });
  });
});

test("sub2 worker cycle skips rate updates when target is not configured", async () => {
  await withTempStorage(async (storage) => {
    const summary = await runSub2WorkerCycle({ storage });

    assert.equal(summary.collectedSources, 0);
    assert.equal(summary.updatedGroups, 0);
    assert.deepEqual(summary.errors, []);
  });
});

async function seedStorage(
  storage: ReturnType<typeof createSqliteAppStorage>,
  targetBaseUrl: string,
  sourceBaseUrl: string,
) {
  await storage.saveTargetSettings({ name: "主站", baseUrl: targetBaseUrl, adminApiKey: "target-key" });
  await storage.saveSourceOverview({
    site: {
      id: 1,
      name: "采集站 A",
      siteType: "sub2api",
      baseUrl: sourceBaseUrl,
      authMode: "manual_token",
      accessToken: "source-token",
      rtToken: "",
      username: "",
      password: "",
      rechargeRatio: 1,
      intervalSeconds: 0,
      useProxy: false,
    },
    account: { sourceSiteId: 1, label: "old@example.com", balance: 1 },
    rates: [],
  });
  await storage.saveGroupRule({
    targetGroupId: 5,
    targetGroupName: "VIP",
    currentRate: 1,
    enabled: true,
    mode: "max",
    offset: 0.1,
    multiplier: 2,
    formula: "avg",
    sourceGroupIds: ["1:vip", "1:std"],
  });
}

async function targetRoutes(request: IncomingMessage, response: ServerResponse) {
  assert.equal(request.headers["x-api-key"], "target-key");
  assert.equal(request.url, "/api/v1/admin/groups/5");
  const body = await readJson(request);
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
