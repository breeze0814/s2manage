import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createJsonHttpClient } from "../src/adapters/http-client.ts";
import { initializeSqliteSchema } from "../src/storage/sqlite-schema.ts";

const ROOT = new URL("../", import.meta.url);
const TARGET_ACCOUNT_TEST_PORT_START = 18221;
let nextTargetAccountTestPort = TARGET_ACCOUNT_TEST_PORT_START;

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
    assert.deepEqual(first, [account()]);
    assert.deepEqual(second, first);
  });
});

test("target account channel test calls the remote test endpoint and parses SSE", async () => {
  const remote = createAccountRemote();
  await withServer(remote.handler, async (baseUrl) => {
    const client = await accountClient(baseUrl);
    const result = await client.testChannel(9);
    assert.equal(result.success, true);
    assert.equal(result.model, "gpt-4o-mini");
    assert.match(result.message, /pong/);
    assert.equal(remote.getTestRequests(), 1);
  });
});

test("account service reads SQLite until an explicit remote refresh", async () => {
  const remote = createAccountRemote();
  await withServer(remote.handler, async (baseUrl) => {
    const directory = await mkdtemp(join(tmpdir(), "s2a-target-accounts-"));
    const [serviceModule, storeModule] = await Promise.all([
      import("../src/server/target-accounts/service.ts"),
      import("../src/server/target-accounts/store.ts"),
    ]);
    const store = storeModule.createSqliteTargetAccountStore(`file:${join(directory, "app.db")}`);
    const service = serviceModule.createTargetAccountService({
      client: await accountClient(baseUrl), store, sourceRates: async () => [], testConcurrency: async () => 2,
    });
    try {
      assert.deepEqual(await service.list(), []);
      assert.equal(remote.getRequests(), 0);
      assert.equal((await service.refresh())[0]?.name, "OpenAI A");
      assert.equal((await service.list())[0]?.name, "OpenAI A");
      assert.equal(remote.getRequests(), 1);
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test("target account client follows every pagination page", async () => {
  const requests: string[] = [];
  await withServer((request, response) => {
    requests.push(request.url ?? "");
    const page = request.url?.includes("page=2") ? 2 : 1;
    const item = remoteAccount(page === 1 ? 9 : 10);
    json(response, { data: { items: [item], page, page_size: 1, total: 2 } });
  }, async (baseUrl) => {
    const accounts = await (await accountClient(baseUrl)).listAccounts();
    assert.deepEqual(accounts.map((item) => item.id), [9, 10]);
    assert.deepEqual(requests, [
      "/api/v1/admin/accounts?page=1&page_size=1000",
      "/api/v1/admin/accounts?page=2&page_size=1000",
    ]);
  });
});

test("account routes and dashboard expose refresh and channel test controls without scheduling writes", () => {
  assertAccountRoutesExist();
  assertAccountsHook();
  assertAccountsDashboard();
});

function assertAccountRoutesExist() {
  const files = [
    "src/app/api/accounts/route.ts",
    "src/app/api/accounts/[id]/binding/route.ts",
    "src/app/api/accounts/[id]/test/route.ts",
    "src/app/api/accounts/test-all/route.ts",
    "src/app/api/accounts/refresh/route.ts",
    "src/server/target-accounts/store.ts",
    "src/server/target-accounts/runtime.ts",
    "src/components/accounts/account-binding-dialog.tsx",
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/accounts/use-accounts-dashboard.ts",
  ];
  for (const path of files) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
}

function assertAccountsHook() {
  const page = readFileSync(new URL("src/app/accounts/page.tsx", ROOT), "utf8");
  const hook = readFileSync(new URL("src/components/accounts/use-accounts-dashboard.ts", ROOT), "utf8");
  assert.match(page, /AccountsDashboard/);
  assert.match(hook, /\/api\/accounts/);
  assert.match(hook, /\/test/);
  assert.match(hook, /\/binding/);
  assert.match(hook, /\/api\/accounts\/test-all/);
  assert.match(hook, /testChannel/);
  assert.doesNotMatch(hook, /schedulable/);
  assert.match(hook, /loadAccounts/);
  assert.match(hook, /\/api\/accounts\/refresh/);
  assert.match(hook, /\/api\/groups/);
  assert.match(hook, /\/api\/sources\/rates/);
  assert.match(hook, /\/api\/sources/);
  assert.match(hook, /Promise\.all/);
  const runtime = readFileSync(new URL("src/server/target-accounts/runtime.ts", ROOT), "utf8");
  assert.match(runtime, /TARGET_ACCOUNT_RUNTIME_VERSION/);
  assert.match(runtime, /cached\.version === TARGET_ACCOUNT_RUNTIME_VERSION/);
  assert.match(runtime, /cached\.dispose\(\)/);
  assert.match(runtime, /globalAccounts\.s2aTargetAccountService = runtime/);
  assert.doesNotMatch(runtime, /s2aTargetAccountService\) return globalAccounts\.s2aTargetAccountService/);
}

function assertAccountsDashboard() {
  const dashboard = readFileSync(new URL("src/components/accounts/accounts-dashboard.tsx", ROOT), "utf8");
  assert.match(dashboard, /Account Pool/);
  assert.match(dashboard, /号池管理/);
  assert.doesNotMatch(dashboard, /页面读取本地账号快照/);
  assert.match(dashboard, /GroupTag/);
  assert.match(dashboard, /rate_multiplier/);
  assert.doesNotMatch(dashboard, /共 \{accounts\.length\} 个账号/);
  assert.match(dashboard, /<th>ID<\/th><th>账号<\/th>/);
  assert.match(dashboard, /<td className="font-mono text-sm tabular-nums text-muted">#\{account\.id\}<\/td>/);
  assert.match(dashboard, /刷新账号/);
  assert.match(dashboard, /secondary-button shrink-0/);
  assert.match(dashboard, /CirclePlay/);
  assert.match(dashboard, /测试通道/);
  assert.match(dashboard, /批量测试/);
  assert.match(dashboard, /倍率采集绑定/);
  assert.match(dashboard, /AccountBindingDialog/);
  assert.match(dashboard, /AccountBindingSummary/);
  assert.match(dashboard, /AccountActions/);
  assert.match(dashboard, /<AccountBindingDialog[\s\S]*<TestChannelButton/);
  assert.match(dashboard, /测试状态/);
  assert.match(dashboard, /TestStatus/);
  assert.match(dashboard, /aria-label=\{label\}/);
  assert.doesNotMatch(dashboard, /参与调度|暂停调度|ScheduleSwitch/);
  assert.match(dashboard, /account\.priority \?\? "-"/);
  assert.match(dashboard, /account\.rateMultiplier \?\? "-"/);
  assert.doesNotMatch(dashboard, /优先级 \{account\.priority/);
  assert.doesNotMatch(dashboard, /倍率 ×\{account\.rateMultiplier/);
  const bindingDialog = readFileSync(new URL("src/components/accounts/account-binding-dialog.tsx", ROOT), "utf8");
  assert.match(bindingDialog, /@radix-ui\/react-dialog/);
  assert.match(bindingDialog, /采集渠道/);
  assert.match(bindingDialog, /采集分组/);
  assert.match(bindingDialog, /sourceSiteId, sourceGroupId: UNSELECTED/);
  assert.match(bindingDialog, /className="icon-button"/);
  assert.match(bindingDialog, /<Dialog\.Trigger asChild>\s*<button/);
  assert.doesNotMatch(bindingDialog, /BindingTrigger/);
  assert.match(bindingDialog, /export function AccountBindingSummary/);
  assert.doesNotMatch(bindingDialog, /secondary-button min-h-\[3\.25rem\]/);
  assert.match(bindingDialog, /保存绑定/);
  assert.match(bindingDialog, /解除绑定/);
}

test("schema migration removes schedulable from account snapshots and preserves account data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-account-schema-"));
  const database = new DatabaseSync(join(directory, "app.db"));
  try {
    database.exec(`CREATE TABLE target_account_snapshots (
      account_id INTEGER PRIMARY KEY, account_name TEXT NOT NULL, platform TEXT NOT NULL,
      status TEXT NOT NULL, schedulable INTEGER NOT NULL, rate_multiplier REAL,
      priority INTEGER, group_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT`);
    database.prepare("INSERT INTO target_account_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(9, "OpenAI A", "openai", "active", 1, 1.25, 3, "[7]", new Date().toISOString());
    initializeSqliteSchema(database);
    const columns = database.prepare("PRAGMA table_info(target_account_snapshots)").all() as Array<{ name: string }>;
    assert.equal(columns.some((column) => column.name === "schedulable"), false);
    assert.equal(tableExists(database, "target_account_bindings"), true);
    assert.equal(tableExists(database, "target_account_test_results"), true);
    assert.equal((database.prepare("SELECT account_name FROM target_account_snapshots").get() as { account_name: string }).account_name, "OpenAI A");
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function tableExists(database: DatabaseSync, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function createAccountRemote() {
  let getRequests = 0;
  let testRequests = 0;
  return {
    getRequests: () => getRequests,
    getTestRequests: () => testRequests,
    handler: async (request: IncomingMessage, response: ServerResponse) => {
      assert.equal(request.headers["x-api-key"], "target-key");
      if (request.method === "GET" && request.url === "/api/v1/admin/accounts?page=1&page_size=1000") {
        getRequests += 1;
        return json(response, { data: [remoteAccount()] });
      }
      if (request.method === "POST" && request.url === "/api/v1/admin/accounts/9/test") {
        testRequests += 1;
        assert.match(String(request.headers.accept), /text\/event-stream/);
        return sse(response, [
          { type: "test_start", model: "gpt-4o-mini" },
          { type: "content", text: "pong" },
          { type: "test_complete", success: true },
        ]);
      }
      return json(response, { message: "not found" }, 404);
    },
  };
}

function remoteAccount(id = 9) {
  return { id, name: id === 9 ? "OpenAI A" : `OpenAI ${id}`, platform: "openai", status: "active", rate_multiplier: 1.25, priority: 3, account_groups: [{ group_id: 7 }] };
}

function account() {
  return { id: 9, name: "OpenAI A", platform: "openai", status: "active", rateMultiplier: 1.25, priority: 3, groupIds: [7] };
}

async function withServer<T>(handler: (request: IncomingMessage, response: ServerResponse) => void, task: (baseUrl: string) => Promise<T>) {
  const server = createServer(handler);
  const port = nextTargetAccountTestPort++;
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

function sse(response: ServerResponse, events: readonly Record<string, unknown>[]) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.end(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
}
