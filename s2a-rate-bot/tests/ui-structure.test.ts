import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync("ui/index.html", "utf8");
const css = readdirSync("ui")
  .filter((fileName) => fileName.endsWith(".css"))
  .map((fileName) => readFileSync(`ui/${fileName}`, "utf8"))
  .join("\n");
const js = readdirSync("ui")
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => readFileSync(`ui/${fileName}`, "utf8"))
  .join("\n");

test("pub UI uses sub2 detection station as the site title", () => {
  assert.match(html, /<title>sub2检测站<\/title>/);
  assert.match(html, /<h1>sub2检测站<\/h1>/);
  assert.match(html, /class="eyebrow">sub2检测站</);
});

test("pub UI is split into settings, groups, and source station views", () => {
  assert.match(html, /data-view="settings"/);
  assert.match(html, /data-view="groups"/);
  assert.match(html, /data-view="sources"/);
  assert.match(html, /data-view="accounts"/);
  assert.match(html, /data-route="settings"/);
  assert.match(html, /data-route="groups"/);
  assert.match(html, /data-route="sources"/);
  assert.match(html, /data-route="accounts"/);
});

test("settings tab is the final primary navigation item", () => {
  const nav = html.match(/<nav class="tabs main-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.match(nav, /data-route="groups"[\s\S]*data-route="sources"[\s\S]*data-route="accounts"[\s\S]*data-route="settings"/);
});

test("settings view owns target, bot, and proxy configuration", () => {
  assert.match(html, /id="target-form"/);
  assert.match(html, /id="bot-settings-form"/);
  assert.match(html, /id="proxy-settings-form"/);
  assert.match(html, /id="worker-settings-form"/);
  assert.match(html, /name="intervalSeconds"/);
  assert.match(js, /workerSettings/);
  assert.match(js, /\/api\/settings\/worker/);
});

test("groups view contains per-group rule controls and target group rendering", () => {
  assert.match(html, /id="groups-view"/);
  assert.match(html, /id="groups-list"/);
  assert.match(html, /id="load-groups"[^>]*>刷新目标站分组/);
  assert.match(js, /renderTargetGroups/);
  assert.match(js, /data-group-rate/);
  assert.match(js, /data-rule-mode/);
});

test("groups view supports multi-source bindings and advanced rule presets", () => {
  assert.match(js, /attachGroupUi/);
  assert.match(js, /sourceGroupIds/);
  assert.match(js, /data-source-binding/);
  assert.match(js, /data-source-multiselect/);
  assert.match(js, /data-source-dropdown/);
  assert.match(js, /data-source-summary/);
  assert.match(js, /data-source-group-id/);
  assert.match(js, /selectedSourceRates/);
  assert.match(js, /calculateRuleRate/);
  assert.match(js, /value="max"/);
  assert.match(js, /value="min"/);
  assert.match(js, /value="avg_formula"/);
  assert.match(js, /data-rule-formula/);
  assert.match(js, /data-rule-offset/);
  assert.match(js, /data-rule-multiplier/);
});

test("source group binding is a multi-select dropdown instead of a flat list", () => {
  assert.match(js, /source-multiselect/);
  assert.match(js, /source-dropdown-panel/);
  assert.match(js, /syncBindingSummary/);
  assert.doesNotMatch(js, /class="source-binding-list"/);
  assert.doesNotMatch(css, /\.source-binding-list\s*{/);
});

test("source group dropdown can escape the rule card clipping area", () => {
  assert.match(css, /\.cyber-grid\s+\.rule-card:has\(\.source-multiselect\[open\]\)/);
  assert.match(css, /\.source-multiselect\[open\]\s+\.source-dropdown-panel/);
  assert.match(css, /overflow:\s*visible/);
  assert.match(css, /z-index:\s*80/);
});

test("groups view presents rule cards as a dense operations layout", () => {
  assert.match(js, /group-metric-strip/);
  assert.match(js, /binding-panel/);
  assert.match(js, /rule-config-panel/);
  assert.match(js, /rule-execution-panel/);
  assert.match(css, /\.group-metric-strip/);
  assert.match(css, /\.rule-layout/);
  assert.match(css, /\.rule-panel/);
});

test("group rule preset labels do not show ordinal prefixes", () => {
  assert.match(js, />最大值</);
  assert.match(js, />最小值</);
  assert.match(js, />平均公式</);
  assert.doesNotMatch(js, /第一/);
  assert.doesNotMatch(js, /第二/);
  assert.doesNotMatch(js, /第三/);
});

test("source station view owns source rate collection", () => {
  assert.match(html, /id="source-form"/);
  assert.doesNotMatch(html, /id="source-result"/);
  assert.match(html, /id="source-message"/);
  assert.match(html, /id="source-balance-list"/);
  assert.match(html, /id="source-list"/);
  assert.match(html, /id="source-dialog"/);
  assert.match(html, /id="open-source-dialog"/);
  assert.match(html, /name="authMode"/);
  assert.match(html, /value="password"/);
  assert.match(html, /value="manual_token"/);
  assert.match(html, /name="rtToken"/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
  assert.match(js, /renderSourceSites/);
  assert.match(js, /refreshSourceSite/);
  assert.match(js, /data-refresh-source/);
  assert.match(js, /onSourceSitesChanged/);
  assert.match(js, /\/api\/source\/overview/);
});

test("top refresh reloads database backed dashboard data", () => {
  assert.match(html, /id="refresh"[^>]*aria-label="刷新本地数据"/);
  assert.match(js, /refreshDashboard/);
  assert.match(js, /loadAppConfig\(sourceUi\)/);
  assert.match(js, /qs\("#refresh"\)\.addEventListener\("click", \(\) => refreshDashboard\(\)/);
});

test("account scheduling view can refresh and toggle target accounts", () => {
  assert.match(html, /id="accounts-view"/);
  assert.match(html, /id="load-accounts"/);
  assert.match(html, /id="accounts-list"/);
  assert.match(js, /attachAccountUi/);
  assert.match(js, /\/api\/target\/accounts/);
  assert.match(js, /\/api\/target\/account-schedulable/);
  assert.match(js, /data-toggle-account/);
});

test("account scheduling view uses a dense operations table layout", () => {
  assert.match(html, /href="\/accounts\.css"/);
  assert.match(js, /account-overview/);
  assert.match(js, /account-table/);
  assert.match(js, /account-row/);
  assert.match(js, /account-state/);
  assert.match(js, /renderAccountStats/);
  assert.match(css, /\.account-overview/);
  assert.match(css, /\.account-table/);
  assert.match(css, /\.account-row/);
  assert.match(css, /\.account-action/);
});

test("source station page does not dump saved source JSON", () => {
  assert.doesNotMatch(html, /尚未读取采集站倍率/);
  assert.match(js, /showSourceMessage/);
  assert.doesNotMatch(js, /setResult\(result,\s*source\)/);
});

test("source station group list renders source platform", () => {
  assert.match(js, /columnheader">平台/);
  assert.match(js, /rate\.platform/);
});

test("source dialog can opt into global proxy", () => {
  assert.match(html, /name="useProxy"/);
  assert.match(html, /使用全局代理/);
  assert.match(js, /useProxy/);
  assert.match(js, /proxyUrl/);
  assert.match(js, /sourceProxyUrl/);
  assert.match(js, /#proxy-settings-form/);
});

test("source balance summary renders each source balance instead of a total", () => {
  assert.doesNotMatch(html, /id="source-balance-total"/);
  assert.match(js, /renderSourceBalanceItems/);
  assert.doesNotMatch(js, /\bbalances\b/);
  assert.doesNotMatch(js, /balances\.reduce/);
});

test("source dialog lets users choose password login or token auth", () => {
  assert.doesNotMatch(html, /<select name="authMode"/);
  assert.match(html, /type="radio" name="authMode" value="password"/);
  assert.match(html, /type="radio" name="authMode" value="manual_token"/);
  assert.match(html, /data-auth-fields="password"/);
  assert.match(html, /data-auth-fields="manual_token"/);
  assert.match(js, /attachAuthModeToggle/);
  assert.match(js, /syncAuthModeFields/);
});

test("frontend JSON requests expose non JSON responses without parser crashes", () => {
  assert.match(js, /response\.text\(\)/);
  assert.match(js, /parseJsonResponse/);
  assert.doesNotMatch(js, /await response\.json\(\)/);
});

test("frontend loads and persists app data through database APIs", () => {
  assert.match(js, /\/api\/app-config/);
  assert.match(js, /loadAppConfig/);
  assert.match(js, /applyAppConfig/);
  assert.match(js, /\/api\/settings\/target/);
  assert.match(js, /\/api\/settings\/bot/);
  assert.match(js, /\/api\/settings\/proxy/);
  assert.match(js, /payload\.source/);
});

test("pub UI uses a data-dense operations console design system", () => {
  assert.match(html, /href="\/dashboard\.css"/);
  assert.match(html, /href="\/group-rules\.css"/);
  assert.match(html, /class="app-shell[^"]*"/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="command-panel"/);
  assert.match(html, /class="status-matrix"/);
  assert.match(html, /class="workspace"/);
  assert.match(html, /class="settings-grid"/);
  assert.match(html, /class="collection-header"/);
  assert.match(html, /class="source-ledger"/);
});

test("pub UI applies a dark cyberpunk operations theme", () => {
  assert.match(html, /href="\/cyberpunk\.css"/);
  assert.match(html, /class="cyber-grid"/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /--signal-cyan/);
  assert.match(css, /--signal-amber/);
  assert.doesNotMatch(css, /--neon-magenta/);
  assert.doesNotMatch(css, /--neon-lime/);
});

test("pub UI keeps a Vercel-like centered application frame", () => {
  assert.match(html, /class="app-shell vercel-frame"/);
  assert.match(css, /\.vercel-frame/);
  assert.match(css, /--frame-width/);
  assert.match(css, /margin:\s*0 auto/);
});

test("pub UI separates primary and inactive button colors", () => {
  assert.match(css, /--button-primary-bg/);
  assert.match(css, /--button-primary-text/);
  assert.match(css, /--button-muted-bg/);
  assert.match(css, /--button-muted-text/);
  assert.match(css, /\.cyber-grid \.tab:not\(\.active\)/);
  assert.doesNotMatch(css, /\.cyber-grid \.tab:not\(\.active\)[^{]*{[^}]*color:\s*#fff/i);
});

test("pub UI makes success and failure states visually distinct", () => {
  assert.match(css, /--success/);
  assert.match(css, /--danger/);
  assert.match(css, /\.cyber-grid \.status-tile\[data-tone="success"\]/);
  assert.match(css, /\.cyber-grid \.status-tile\[data-tone="error"\]/);
  assert.match(css, /\.cyber-grid \.pill\.success/);
  assert.match(css, /\.cyber-grid \.pill\.error/);
  assert.match(css, /\.cyber-grid \.source-message\[data-tone="success"\]/);
  assert.match(css, /\.account-state\.success/);
  assert.match(css, /\.account-state\.error/);
  assert.match(js, /statusTone/);
  assert.match(js, /target\.state\.closest\("\.status-tile"\)\.dataset\.tone/);
  assert.match(js, /showSettingsMessage\("机器人信息已保存", "success"\)/);
  assert.match(js, /showSourceMessage\(deps, "已保存并读取倍率", "success"\)/);
});
