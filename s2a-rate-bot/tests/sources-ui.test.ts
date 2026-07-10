import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string) {
  const url = new URL(path, ROOT);
  assert.equal(existsSync(url), true, `${path} should exist`);
  return readFileSync(url, "utf8");
}

test("source dashboard distinguishes remote collection from local page reload", () => {
  const dashboard = source("src/components/sources/sources-dashboard.tsx")
    + source("src/components/sources/use-sources-dashboard.ts");

  assert.match(dashboard, /重新请求全部远端/);
  assert.match(dashboard, /重新读取页面数据/);
  assert.match(dashboard, /\/api\/sources\/refresh-all/);
  assert.match(dashboard, /\/api\/sources\/rates/);
});

test("source site management uses a blocking Dialog with complete lifecycle actions", () => {
  const dialog = source("src/components/sources/source-site-dialog.tsx");
  const table = source("src/components/sources/source-site-table.tsx");

  assert.match(dialog, /@radix-ui\/react-dialog/);
  assert.match(dialog, /sub2api/);
  assert.match(dialog, /newapi/);
  assert.match(dialog, /password/);
  assert.match(dialog, /manual_token/);
  assert.match(table, /data-refresh-site/);
  assert.match(table, /data-edit-site/);
  assert.match(table, /data-delete-site/);
});

test("aggregated source rate table exposes site, group, platform and rate columns", () => {
  const table = source("src/components/sources/source-rates-table.tsx");

  assert.match(table, /采集站/);
  assert.match(table, /分组/);
  assert.match(table, /平台/);
  assert.match(table, /原始倍率/);
  assert.match(table, /有效倍率/);
  assert.match(table, /最后采集/);
});

test("source page mounts the dashboard and rates API exists", () => {
  const page = source("src/app/sources/page.tsx");
  assert.match(page, /SourcesDashboard/);
  source("src/app/api/sources/rates/route.ts");
});
