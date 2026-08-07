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
  const component = source("src/components/sources/sources-dashboard.tsx");
  const dashboard = component + source("src/components/sources/use-sources-dashboard.ts");

  assert.match(dashboard, /重新请求全部远端/);
  assert.doesNotMatch(component, /重新读取页面数据|重载数据|onReload/);
  assert.match(dashboard, /text="添加站点"/);
  assert.match(dashboard, /text="刷新全部"/);
  assert.doesNotMatch(dashboard, /function Metric/);
  assert.doesNotMatch(dashboard, /<Metric label=/);
  assert.match(dashboard, /\/api\/sources\/refresh-stream/);
  assert.match(dashboard, /\/api\/sources\/rates/);
});

test("source site management uses a blocking Dialog with complete lifecycle actions", () => {
  const dialog = source("src/components/sources/source-site-dialog.tsx");
  const dashboard = source("src/components/sources/sources-dashboard.tsx");
  const table = source("src/components/sources/source-site-table.tsx");
  const packageJson = source("package.json");

  assert.match(dialog, /from "\.\.\/ui\/dialog"/);
  assert.match(dialog, /<DialogContent/);
  assert.match(dialog, /sub2api/);
  assert.match(dialog, /newapi/);
  assert.match(dialog, /password/);
  assert.match(dialog, /manual_token/);
  assert.match(dialog, /<Select ariaLabel="站点类型"/);
  assert.doesNotMatch(dialog, /<select/);
  assert.match(dialog, /form\.siteType === "newapi" \? "用户名" : "邮箱"/);
  assert.match(dialog, /New API Token 模式必须填写 Access Token/);
  assert.match(dialog, /New-Api-User/);
  assert.match(dialog, /newApiUserId/);
  assert.match(dialog, /label="官网地址"/);
  assert.match(dialog, /form\.websiteUrl/);
  assert.match(dialog, /update\("websiteUrl", value\)/);
  assert.match(dialog, /websiteUrl: site\.websiteUrl/);
  assert.match(dialog, /w-\[min\(96vw,920px\)\]/);
  assert.match(dialog, /md:grid-cols-\[auto_auto_minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(dialog, /form\.siteType === "sub2api" \? <Field label="Refresh Token"/);
  assert.match(dialog, /update\("refreshToken", ""\)/);
  assert.equal((dialog.match(/<fieldset/g) ?? []).length, 2);
  assert.match(table, /data-refresh-site/);
  assert.match(table, /data-edit-site/);
  assert.match(table, /data-delete-site/);
  assert.match(table, /data-channel-monitors/);
  assert.match(table, /site\.siteType === "sub2api"/);
  assert.match(table, /data-open-site-website/);
  assert.match(table, /href=\{site\.websiteUrl\}/);
  assert.match(table, /target="_blank"/);
  assert.match(table, /rel="noopener noreferrer"/);
  assert.match(table, /未配置官网/);
  assert.match(packageJson, /@radix-ui\/react-context-menu/);
  assert.match(table, /from "\.\.\/ui\/context-menu"/);
  assert.match(table, /<ContextMenuTrigger asChild>/);
  assert.match(table, /<ContextMenuContent/);
  assert.match(table, /<ContextMenuSeparator/);
  assert.match(table, /onOpenChange=\{\(open\) => \{ if \(open\) props\.onSelect\(site\.id\); \}\}/);
  assert.match(table, /data-\[state=open\]:border-primary/);
  assert.match(table, /data-\[state=open\]:bg-primary\/5/);
  assert.match(table, /text-danger data-\[highlighted\]:bg-danger\/10/);
  assert.match(table, /TypeTag/);
  assert.match(table, /SiteMeta/);
  assert.match(table, /充值 ×/);
  assert.doesNotMatch(table, /账号认证/);
  assert.doesNotMatch(table, /intervalSeconds/);
  assert.doesNotMatch(table, /ActionButtons|IconButton|SITE_ACTION_CLASS/);
  assert.match(table, /grid gap-3/);
  assert.match(table, /rounded-lg border bg-surface/);
  assert.match(table, /border-primary bg-primary\/5 ring-1 ring-primary\/20/);
  assert.match(table, /border-border-strong hover:border-primary\/40/);
  assert.doesNotMatch(table, /divide-y|border-l-/);
  assert.match(table, /border-t border-border pt-3/);
  assert.match(table, /role="listbox"/);
  assert.match(table, /role="option"/);
  assert.match(table, /aria-selected=\{props\.selected\}/);
  assert.match(dashboard, /source-side-rail min-w-0[\s\S]*aria-labelledby="source-sites-title"/);
  assert.match(dashboard, /id="source-sites"/);
  assert.match(dashboard, /MobileSiteSummary/);
  assert.match(dashboard, /sitesExpanded/);
  assert.doesNotMatch(dashboard, /<section className="panel min-w-0 overflow-hidden" aria-labelledby="source-sites-title">/);
  assert.doesNotMatch(table, /border-l-transparent/);
  assert.match(table, /余额/);
  assert.match(table, /CardActions/);
  assert.match(table, /compact-icon-button/);
  assert.match(dialog, /<DialogContent/);
  assert.match(dialog, /bg-primary/);
  assert.match(dialog, /CompactNumberInput/);
  assert.match(dialog, /suffix="秒"/);
  assert.match(dialog, /suffix="倍"/);
  assert.match(table, /bg-surface/);
});

test("Sub2API source cards open the live channel monitor timeline", () => {
  const dashboard = source("src/components/sources/sources-dashboard.tsx");
  const table = source("src/components/sources/source-site-table.tsx");
  const dialog = source("src/components/sources/source-channel-monitors-dialog.tsx");

  assert.match(dashboard, /SourceChannelMonitorsDialog/);
  assert.match(dashboard, /onMonitors=\{setMonitorSite\}/);
  assert.match(table, /Activity/);
  assert.match(table, /渠道监控/);
  assert.match(dialog, /\/api\/sources\/\$\{siteId\}\/channel-monitors/);
  assert.match(dialog, /7日可用率/);
  assert.match(dialog, /响应延迟/);
  assert.match(dialog, /网络延迟/);
  assert.match(dialog, /<svg/);
  assert.match(dialog, /Asia\/Shanghai/);
});

test("aggregated source rate table combines group and site in one column", () => {
  const dashboard = source("src/components/sources/sources-dashboard.tsx");
  const table = source("src/components/sources/source-rates-table.tsx");
  const effectiveRate = source("src/components/ui/effective-rate-value.tsx");
  const platformIcon = source("src/components/platform-icon.tsx");

  assert.match(dashboard, /data-source-split-layout/);
  assert.match(dashboard, /selectedSiteId/);
  assert.match(dashboard, /const activeSiteId = selectedSite\?\.id \?\? null/);
  assert.match(dashboard, /onSelect=\{setSelectedSiteId\}/);
  assert.match(dashboard, /onShowAll=\{\(\) => setSelectedSiteId\(null\)\}/);
  assert.doesNotMatch(dashboard, /view\.sites\[0\]\?\.id/);
  assert.match(table, /展示全部/);
  assert.match(table, /matchesSite/);
  assert.match(dashboard, /source-split/);
  assert.match(dashboard, /source-side-rail/);
  assert.match(table, /采集站/);
  assert.match(table, /分组/);
  assert.match(table, /ID \/ 采集站/);
  assert.match(table, /#\{rate\.groupId\}[\s\S]*SiteTag name=\{siteName\}/);
  assert.match(table, /平台/);
  assert.match(table, /原始倍率/);
  assert.match(table, /有效倍率/);
  assert.match(table, /有效倍率：低到高/);
  assert.match(table, /有效倍率：高到低/);
  assert.match(table, /useState<RateOrder>\("desc"\)/);
  assert.match(table, /min-width: 1280px/);
  assert.match(table, /min-width: 1536px/);
  assert.match(table, /<EffectiveRateValue>×\{formatRate\(rate\.effectiveRate\)\}<\/EffectiveRateValue>/);
  assert.doesNotMatch(table, /<Tag tone="rate"[^>]*>×\{formatRate\(rate\.effectiveRate\)\}<\/Tag>/);
  assert.match(effectiveRate, /text-effective-rate/);
  assert.doesNotMatch(effectiveRate, /border|bg-surface|px-2/);
  assert.match(table, /sortRates/);
  assert.doesNotMatch(table, /"none"/);
  assert.match(table, /DEFAULT_PAGE_SIZE = 10/);
  assert.match(table, /每页展示条数/);
  assert.match(table, /value: "15"/);
  assert.match(table, /value: "20"/);
  assert.match(table, /第 \{page\} \/ \{pageCount\} 页/);
  assert.match(table, /最后采集/);
  assert.match(table, /PlatformLabel/);
  assert.match(table, /PlatformAction/);
  assert.match(table, /RateToolbar/);
  assert.match(table, /aria-label="倍率筛选与排序"/);
  assert.match(table, /ariaLabel="平台筛选"/);
  assert.match(table, /rateStatusOptions/);
  assert.match(table, /<TableHead className="sticky-action-header">操作<\/TableHead>/);
  assert.match(table, /<TableCell className="sticky-action-cell">/);
  assert.match(table, /PLATFORM_OPTIONS/);
  assert.match(table, /自动识别/);
  assert.match(table, /onPlatformChange/);
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

test("source operations expose persisted history and balance alerts without site tabs", () => {
  const dashboard = source("src/components/sources/sources-dashboard.tsx");
  const history = source("src/components/sources/source-history-dialog.tsx");
  const dialog = source("src/components/sources/source-site-dialog.tsx");
  const table = source("src/components/sources/source-site-table.tsx");
  const binding = source("src/components/sources/source-binding-dialog.tsx");

  assert.match(dashboard, /SourceRateHistoryDialog/);
  assert.match(dashboard, /SourceCollectionRunsDialog/);
  assert.match(history, /\/api\/sources\/changes/);
  assert.match(history, /\/api\/sources\/runs/);
  assert.match(history, /倍率变化历史/);
  assert.match(history, /采集运行记录/);
  assert.match(dialog, /余额告警阈值/);
  assert.match(dialog, /form\.remark/);
  assert.match(table, /余额低于阈值/);
  assert.match(table, /今日消费/);
  assert.match(table, /历史充值/);
  assert.match(binding, /\/api\/sources\/rates\/bindings/);
  assert.match(binding, /管理目标分组关联/);
  assert.match(binding, /平台不匹配/);
  assert.doesNotMatch(dashboard, /Tabs|TabList|TabTrigger/);
});
