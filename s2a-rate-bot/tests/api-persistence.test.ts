import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { getSub2ApiSourceAccount } from "../src/adapters/source-account-client.ts";
import { collectSub2ApiSourceRates } from "../src/adapters/source-rate-client.ts";

const API_PERSISTENCE_TEST_PORT_START = 18201;
let nextApiPersistenceTestPort = API_PERSISTENCE_TEST_PORT_START;

test("source account collection rejects invalid balance data", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/v1/auth/me") {
      return json(response, { code: 0, data: { email: "source@example.com", balance: "invalid" } });
    }
    return json(response, { code: 1, message: "not found" }, 404);
  }, async (baseUrl) => {
    await assert.rejects(getSub2ApiSourceAccount(sourceRequest(baseUrl)), /账户余额不是有效数字/);
  });
});

test("Sub2API collection rejects missing key data instead of returning an empty snapshot", async () => {
  await withServer((request, response) => {
    if (request.url === "/api/v1/groups/available") return json(response, { code: 0 });
    if (request.url === "/api/v1/groups/rates") return json(response, { code: 0, data: {} });
    return json(response, { code: 1, message: "not found" }, 404);
  }, async (baseUrl) => {
    await assert.rejects(collectSub2ApiSourceRates(sourceRequest(baseUrl)), /响应缺少 data 数组/);
  });
});

function sourceRequest(baseUrl: string) {
  return { sourceSiteId: 7, baseUrl, accessToken: "token", rechargeRatio: 1, targetRechargeRatio: 1 } as const;
}

async function withServer<T>(handler: (request: IncomingMessage, response: ServerResponse) => void, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  const port = nextApiPersistenceTestPort++;
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try { return await task(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function json(response: ServerResponse, payload: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
