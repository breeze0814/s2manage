import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string) {
  const url = new URL(path, ROOT);
  assert.equal(existsSync(url), true, `${path} should exist`);
  return readFileSync(url, "utf8");
}

test("connection governance page exposes lifecycle, health, and metadata operations", () => {
  const page = source("src/app/connections/page.tsx");
  const dashboard = source("src/components/connections/connections-dashboard.tsx");
  const table = source("src/components/connections/connections-table.tsx");
  const create = source("src/components/connections/connection-create-dialog.tsx");
  const shell = source("src/components/app-shell.tsx");

  assert.match(page, /ConnectionsDashboard/);
  assert.match(shell, /href: "\/connections"/);
  assert.match(dashboard, /创建对接/);
  assert.match(dashboard, /健康策略/);
  assert.match(dashboard, /事件记录/);
  assert.match(dashboard, /loadError/);
  assert.match(table, /完整删除|断开真实连接/);
  assert.match(table, /立即探测/);
  assert.match(table, /暂停调度/);
  assert.match(table, /pendingKeys/);
  assert.match(create, /同步加入调价映射/);
  assert.match(create, /antigravity/);
  assert.doesNotMatch(dashboard, /Tabs|TabList|TabTrigger/);
});

test("connection governance API and worker scheduling routes are present", () => {
  source("src/app/api/connections/route.ts");
  source("src/app/api/connections/[id]/route.ts");
  source("src/app/api/connections/[id]/probe/route.ts");
  source("src/app/api/connections/[id]/policy/route.ts");
  source("src/app/api/connections/[id]/action/route.ts");
  source("src/app/api/connection-health/policies/route.ts");
  source("src/app/api/connection-health/events/route.ts");
  source("src/app/api/connections/events/route.ts");
  assert.match(source("src/components/connections/health-events-dialog.tsx"), /连接事件/);
  assert.match(source("src/components/connections/health-events-dialog.tsx"), /重试/);
  assert.match(source("src/components/connections/use-connection-events.ts"), /nextCursor/);
  assert.match(source("src/server/worker/runtime.ts"), /connectionHealth\.service\.runDue/);
});
