import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
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

async function withTempConfig<T>(task: (config: RuntimeConfig) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "s2a-accounts-"));
  try {
    return await task({ port: 0, host: "127.0.0.1", databaseUrl: `file:${join(dir, "app.db")}`, proxyUrl: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

function targetRoutes(request: IncomingMessage, response: ServerResponse) {
  assert.equal(request.headers["x-api-key"], "target-key");
  if (request.method === "GET" && request.url === "/api/v1/admin/accounts?page=1&page_size=1000") {
    json(response, { data: [{ id: 9, name: "OpenAI A", platform: "openai", status: "active", schedulable: true }] });
    return;
  }
  if (request.method === "POST" && request.url === "/api/v1/admin/accounts/9/schedulable") {
    readJson(request).then((body) => {
      assert.equal(body.schedulable, false);
      json(response, { data: { id: 9, name: "OpenAI A", platform: "openai", status: "active", schedulable: false } });
    }).catch((error) => json(response, { error: String(error) }, 500));
    return;
  }
  json(response, { message: "not found" }, 404);
}

test("target account refresh persists account scheduling snapshots", async () => {
  await withTempConfig(async (config) => {
    await withServer(targetRoutes, async (targetBaseUrl) => {
      await withServer(createHandler(config), async (apiBaseUrl) => {
        const body = { baseUrl: targetBaseUrl, adminApiKey: "target-key" };
        const refreshed = await postJson(apiBaseUrl, "/api/target/accounts", body);
        assert.deepEqual(refreshed.accounts, [{
          id: 9,
          name: "OpenAI A",
          platform: "openai",
          status: "active",
          schedulable: true,
          rateMultiplier: null,
          priority: null,
          groupIds: [],
        }]);

        const configPayload = await (await fetch(`${apiBaseUrl}/api/app-config`)).json() as {
          accounts: unknown[];
        };
        assert.deepEqual(configPayload.accounts, refreshed.accounts);
      });
    });
  });
});

test("target account schedulable update writes the returned account snapshot", async () => {
  await withTempConfig(async (config) => {
    await withServer(targetRoutes, async (targetBaseUrl) => {
      await withServer(createHandler(config), async (apiBaseUrl) => {
        const payload = await postJson(apiBaseUrl, "/api/target/account-schedulable", {
          baseUrl: targetBaseUrl,
          adminApiKey: "target-key",
          accountId: 9,
          schedulable: false,
        });
        assert.equal((payload.account as Record<string, unknown>).schedulable, false);
      });
    });
  });
});
