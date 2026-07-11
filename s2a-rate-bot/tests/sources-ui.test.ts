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
  assert.match(table, /TypeTag/);
  assert.match(table, /SiteMeta/);
  assert.match(table, /充值 ×/);
  assert.doesNotMatch(table, /账号认证/);
  assert.doesNotMatch(table, /intervalSeconds/);
  assert.match(table, /size-8/);
  assert.match(table, /余额/);
  assert.match(dialog, /bg-stone-950\/60/);
  assert.match(dialog, /bg-primary/);
  assert.match(dialog, /CompactNumberInput/);
  assert.match(dialog, /suffix="秒"/);
  assert.match(dialog, /suffix="倍"/);
  assert.match(table, /bg-surface/);
});

test("aggregated source rate table combines group and site in one column", () => {
  const dashboard = source("src/components/sources/sources-dashboard.tsx");
  const table = source("src/components/sources/source-rates-table.tsx");
  const platformIcon = source("src/components/platform-icon.tsx");

  assert.match(dashboard, /data-source-split-layout/);
  assert.match(dashboard, /lg:grid-cols-\[minmax\(320px,0\.85fr\)_minmax\(0,1\.65fr\)\]/);
  assert.match(table, /采集站/);
  assert.match(table, /分组/);
  assert.match(table, /分组 \/ 采集站/);
  assert.match(table, /rate\.groupName[\s\S]*SiteTag name=\{siteName\}/);
  assert.match(table, /平台/);
  assert.match(table, /原始倍率/);
  assert.match(table, /有效倍率/);
  assert.match(table, /最后采集/);
  assert.match(table, /PlatformLabel/);
  assert.match(table, /<Tag/);
  assert.match(table, /SiteTag/);
  assert.match(table, /title=\{name\} tone="info"/);
  assert.match(table, /max-w-36 truncate/);
  assert.match(platformIcon, /openai/);
  assert.match(platformIcon, /anthropic/);
  assert.match(platformIcon, /gemini/);
});

test("source page mounts the dashboard and rates API exists", () => {
  const page = source("src/app/sources/page.tsx");
  assert.match(page, /SourcesDashboard/);
  source("src/app/api/sources/rates/route.ts");
});
