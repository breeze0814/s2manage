import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { createJsonHttpClient } from "../src/adapters/http-client.ts";

const ROOT = new URL("../", import.meta.url);

async function accountClient(baseUrl: string) {
  const path = new URL("src/server/target-accounts/client.ts", ROOT);
  assert.equal(existsSync(path), true, "target account client should exist");
  const module = await import("../src/server/target-accounts/client.ts");
  return module.createSub2TargetAccountClient({
    baseUrl,
    adminApiKey: "target-key",
    http: createJsonHttpClient({ timeoutMs: 2_000, proxyUrl: null }),
  });
}

test("target accounts are fetched from the remote API on every refresh", async () => {
  const remote = createAccountRemote();
  await withServer(remote.handler, async (baseUrl) => {
    const client = await accountClient(baseUrl);
    const first = await client.listAccounts();
    const second = await client.listAccounts();

    assert.equal(remote.getRequests(), 2);
    assert.deepEqual(first, [account(true)]);
    assert.deepEqual(second, first);
  });
});

test("failed schedulable updates leave remote state unchanged and successful updates are observable after refresh", async () => {
  const remote = createAccountRemote();
  await withServer(remote.handler, async (baseUrl) => {
    const client = await accountClient(baseUrl);
    remote.failNextUpdate();
    await assert.rejects(() => client.setSchedulable(9, false), /HTTP 503/);
    assert.equal((await client.listAccounts())[0]?.schedulable, true);

    await client.setSchedulable(9, false);
    assert.equal((await client.listAccounts())[0]?.schedulable, false);
  });
});

test("account routes and dashboard expose remote refresh and schedulable controls", () => {
  const files = [
    "src/app/api/accounts/route.ts",
    "src/app/api/accounts/[id]/schedulable/route.ts",
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/accounts/use-accounts-dashboard.ts",
  ];
  for (const path of files) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
  const page = readFileSync(new URL("src/app/accounts/page.tsx", ROOT), "utf8");
  const hook = readFileSync(new URL("src/components/accounts/use-accounts-dashboard.ts", ROOT), "utf8");
  assert.match(page, /AccountsDashboard/);
  assert.match(hook, /\/api\/accounts/);
  assert.match(hook, /schedulable/);
  assert.match(hook, /loadAccounts/);
});

function createAccountRemote() {
  let schedulable = true;
  let getRequests = 0;
  let shouldFail = false;
  return {
    getRequests: () => getRequests,
    failNextUpdate: () => { shouldFail = true; },
    handler: async (request: IncomingMessage, response: ServerResponse) => {
      assert.equal(request.headers["x-api-key"], "target-key");
      if (request.method === "GET" && request.url === "/api/v1/admin/accounts?page=1&page_size=1000") {
        getRequests += 1;
        return json(response, { data: [remoteAccount(schedulable)] });
      }
      if (request.method === "POST" && request.url === "/api/v1/admin/accounts/9/schedulable") {
        if (shouldFail) { shouldFail = false; return json(response, { message: "target rejected" }, 503); }
        const body = await readJson(request);
        schedulable = body.schedulable === true;
        return json(response, { data: remoteAccount(schedulable) });
      }
      return json(response, { message: "not found" }, 404);
    },
  };
}

function remoteAccount(schedulable: boolean) {
  return { id: 9, name: "OpenAI A", platform: "openai", status: "active", schedulable, rate_multiplier: 1.25, priority: 3, account_groups: [{ group_id: 7 }] };
}

function account(schedulable: boolean) {
  return { id: 9, name: "OpenAI A", platform: "openai", status: "active", schedulable, rateMultiplier: 1.25, priority: 3, groupIds: [7] };
}

async function withServer<T>(handler: (request: IncomingMessage, response: ServerResponse) => void, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try { return await task(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: ServerResponse, payload: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
