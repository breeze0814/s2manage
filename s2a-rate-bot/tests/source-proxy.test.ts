import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { createHandler } from "../src/api/server.ts";
import type { RuntimeConfig } from "../src/shared/config.ts";

type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void;
type SourceRouteRequest = {
  readonly headers: IncomingHttpHeaders;
  readonly url?: string;
};

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

function testConfig(proxyUrl: string | null = null): RuntimeConfig {
  return { port: 0, host: "127.0.0.1", databaseUrl: "file::memory:", proxyUrl };
}

function sourceOverviewBody(baseUrl: string) {
  return {
    sourceSiteId: 21,
    siteType: "sub2api",
    baseUrl,
    accessToken: "source-token",
    rechargeRatio: 1,
    useProxy: true,
  };
}

function sourceRoutes(request: SourceRouteRequest, response: ServerResponse) {
  assert.equal(request.headers.authorization, "Bearer source-token");
  if (request.url === "/api/v1/auth/me") {
    json(response, { code: 0, data: { email: "direct@example.com", balance: 9 } });
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

test("source overview does not proxy when global proxy is not configured", async () => {
  await withServer(sourceRoutes, async (sourceBaseUrl) => {
    await withServer(createHandler(testConfig()), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/overview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourceOverviewBody(sourceBaseUrl)),
      });
      assert.equal(response.status, 200);
      const payload = await response.json() as { account: { label: string } };
      assert.equal(payload.account.label, "direct@example.com");
    });
  });
});

test("source overview proxies all source station requests when enabled", async () => {
  const proxiedPaths: string[] = [];
  await withServer((request, response) => {
    const targetUrl = new URL(request.url ?? "");
    proxiedPaths.push(targetUrl.pathname);
    sourceRoutes({ headers: request.headers, url: targetUrl.pathname }, response);
  }, async (proxyUrl) => {
    await withServer(createHandler(testConfig(proxyUrl)), async (apiBaseUrl) => {
      const response = await fetch(`${apiBaseUrl}/api/source/overview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourceOverviewBody("http://source.invalid")),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(proxiedPaths.sort(), [
        "/api/v1/auth/me",
        "/api/v1/groups/available",
        "/api/v1/groups/rates",
      ]);
    });
  });
});
