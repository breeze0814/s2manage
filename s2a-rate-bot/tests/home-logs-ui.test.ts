import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string) {
  const file = new URL(path, ROOT);
  assert.equal(existsSync(file), true, `${path} should exist`);
  return readFileSync(file, "utf8");
}

test("home dashboard aggregates existing system APIs", () => {
  const page = source("src/app/page.tsx");
  const dashboard = source("src/components/home/home-dashboard.tsx");

  assert.match(page, /HomeDashboard/);
  assert.match(dashboard, /\/api\/sources/);
  assert.match(dashboard, /\/api\/groups/);
  assert.match(dashboard, /\/api\/sources\/rates/);
  assert.match(dashboard, /\/api\/sources\/changes/);
  assert.match(dashboard, /\/api\/worker\/status/);
  assert.match(dashboard, /采集站状态/);
  assert.match(dashboard, /采集站总余额/);
  assert.match(dashboard, /site\.balance/);
  assert.match(dashboard, /METRIC_TONES/);
  assert.match(dashboard, /Worker 最近运行/);
  const changes = source("src/components/home/rate-change-panel.tsx");
  const route = source("src/app/api/sources/changes/route.ts");
  assert.match(changes, /Recent Rate Changes/);
  assert.match(changes, /最近 24 小时/);
  assert.match(route, /CHANGE_WINDOW_MS = 24 \* 60 \* 60 \* 1_000/);
  assert.match(route, /changes\(\{ limit: CHANGE_LIMIT, since \}\)/);
  assert.match(changes, /新增/);
  assert.match(changes, /已删除/);
  assert.match(changes, /oldRate/);
  assert.match(changes, /newRate/);
});

test("system logs page exposes external API and Worker business logs", () => {
  const page = source("src/app/logs/page.tsx");
  const dashboard = source("src/components/logs/logs-dashboard.tsx");
  const route = source("src/app/api/logs/route.ts");

  assert.match(page, /LogsDashboard/);
  assert.match(dashboard, /\/api\/logs/);
  const logger = source("src/server/logging/business-logger.ts");
  const http = source("src/adapters/http-client.ts");
  const worker = source("src/server/worker/runtime.ts");
  assert.match(dashboard, /外部 API/);
  assert.match(dashboard, /Worker 执行记录/);
  assert.match(route, /BUSINESS_LOG_FILES/);
  assert.match(route, /MAX_LOG_BYTES = 500_000/);
  assert.match(route, /MAX_ENTRIES = 500/);
  assert.match(route, /requireAuthenticatedRequest/);
  assert.match(logger, /external-api\.log/);
  assert.match(logger, /worker\.log/);
  assert.match(http, /writeExternalApiLog/);
  assert.match(worker, /writeWorkerLog/);
});
