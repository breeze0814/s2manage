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

test("pub UI is split into settings, groups, bot, and source station views", () => {
  assert.match(html, /data-view="settings"/);
  assert.match(html, /data-view="groups"/);
  assert.match(html, /data-view="sources"/);
  assert.match(html, /data-view="accounts"/);
  assert.match(html, /data-view="bot"/);
  assert.match(html, /data-view="runtime"/);
  assert.match(html, /data-route="settings"/);
  assert.match(html, /data-route="groups"/);
  assert.match(html, /data-route="sources"/);
  assert.match(html, /data-route="accounts"/);
  assert.match(html, /data-route="bot"/);
  assert.match(html, /data-route="runtime"/);
});

test("top service status uses three column indicators and source balances are on their own row", () => {
  assert.match(html, /class="service-status-row"/);
  assert.match(html, /data-service-status="api"/);
  assert.match(html, /data-service-status="worker"/);
  assert.match(html, /data-service-status="bot"/);
  assert.match(html, /id="api-status-state"/);
  assert.match(html, /id="worker-status-state"/);
  assert.match(html, /id="bot-status-state"/);
  assert.match(html, /class="status-dot"/);
  assert.match(html, /class="balance-row"/);
  assert.match(html, /id="source-balance-list"/);
  assert.doesNotMatch(html, /id="service-status-indicator"/);
  assert.doesNotMatch(html, /id="service-status-state"/);
  assert.match(js, /renderServiceStatus/);
  assert.match(js, /serviceStatusTargets/);
  assert.doesNotMatch(js, /serviceStatusSummary/);
  assert.match(css, /\.service-status-row/);
  assert.match(css, /\.service-status-indicator/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.status-dot/);
  assert.match(css, /\.balance-row/);
  assert.match(css, /\.balance-list\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
});

test("settings tab is the final primary navigation item", () => {
  const nav = html.match(/<nav class="tabs main-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.match(nav, /data-route="groups"[\s\S]*data-route="sources"[\s\S]*data-route="accounts"[\s\S]*data-route="bot"[\s\S]*data-route="runtime"[\s\S]*data-route="settings"/);
});

test("settings view owns target, proxy, and worker configuration", () => {
  assert.match(html, /id="target-form"/);
  assert.match(html, /id="proxy-settings-form"/);
  assert.match(html, /id="worker-settings-form"/);
  const settingsView = html.match(/id="settings-view"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(settingsView, /id="bot-settings-form"/);
  assert.match(html, /name="intervalSeconds"/);
  assert.match(js, /workerSettings/);
  assert.match(js, /\/api\/settings\/worker/);
});

test("bot view presents each bot ability as a button with its own dialog", () => {
  assert.match(html, /id="bot-view"/);
  assert.match(html, /id="bot-action-grid"/);
  assert.match(html, /id="open-bot-connection-settings"/);
  assert.match(html, /id="open-bot-command-settings"/);
  assert.match(html, /id="open-bot-active-settings"/);
  assert.match(html, /id="open-bot-stats-settings"/);
  assert.match(html, /id="bot-settings-dialog"/);
  assert.match(html, /id="bot-command-dialog"/);
  assert.match(html, /id="bot-active-dialog"/);
  assert.match(html, /id="bot-stats-dialog"/);
  assert.match(html, /id="close-bot-settings"/);
  assert.match(html, /id="close-bot-command-settings"/);
  assert.match(html, /id="close-bot-active-settings"/);
  assert.match(html, /id="close-bot-stats-settings"/);
  assert.match(html, /id="bot-settings-form"/);
  assert.match(html, /id="bot-command-settings-form"/);
  assert.match(html, /id="bot-active-settings-form"/);
  assert.match(html, /id="bot-stats-settings-form"/);
  assert.match(html, /id="bot-capabilities"/);
  assert.match(html, /data-bot-passive-status/);
  assert.match(html, /data-bot-active-status/);
  assert.match(html, /data-bot-stats-status/);
  assert.match(html, /指令管理/);
  assert.match(html, /主动私聊/);
  assert.match(html, /邀请活动/);
  assert.match(html, /name="commandHelpEnabled"/);
  assert.match(html, /name="commandRateEnabled"/);
  assert.match(html, /name="commandBindEnabled"/);
  assert.match(html, /name="commandUnbindEnabled"/);
  assert.match(html, /name="commandInviteHelpEnabled"/);
  assert.match(html, /name="commandInviteMineEnabled"/);
  assert.match(html, /name="commandInviteLeaderboardEnabled"/);
  assert.match(html, /name="clearBotToken"/);
  assert.match(html, /name="clearAdminApiKey"/);
  assert.match(html, /name="activePrivateMessageEnabled"/);
  assert.match(html, /name="scheduledStatsEnabled"/);
  assert.match(html, /name="inviteActivityStartDate"/);
  assert.match(html, /name="inviteActivityActiveRewardAmount"/);
  assert.match(html, /name="inviteActivityInactiveRewardAmount"/);
  assert.match(html, /id="load-invite-activity"/);
  assert.match(html, /id="invite-activity-leaderboard"/);
  assert.match(js, /renderBotCapabilities/);
  assert.match(js, /target\?\.adminApiKeySet/);
  assert.match(js, /openBotConnectionDialog/);
  assert.match(js, /openBotCommandDialog/);
  assert.match(js, /openBotActiveDialog/);
  assert.match(js, /openBotStatsDialog/);
  assert.match(js, /closeBotDialog/);
  assert.match(js, /botCapabilityStatus/);
  assert.match(js, /loadInviteActivityPreview/);
  assert.match(js, /loadRuntimeEvents/);
  assert.match(js, /renderRuntimeEvents/);
  assert.match(js, /\/api\/runtime\/events/);
  assert.match(js, /renderInviteActivityPreview/);
  assert.match(js, /\/api\/bot\/invite-activity/);
  assert.match(js, /\/api\/settings\/bot\/connection/);
  assert.match(js, /\/api\/settings\/bot\/commands/);
  assert.match(js, /\/api\/settings\/bot\/active/);
  assert.match(js, /\/api\/settings\/bot\/invite-activity/);
  assert.match(js, /withPendingButton/);
  assert.match(js, /renderInviteActivityStatus/);
  assert.match(html, /id="invite-activity-status"/);
  assert.doesNotMatch(html, /S2A_BOT_STATS_INTERVAL_SECONDS/);
  assert.doesNotMatch(js, /S2A_BOT_STATS_INTERVAL_SECONDS/);
  assert.match(html, /开启后每 3 天结算一次/);
  assert.match(css, /\.bot-action-grid/);
  assert.match(css, /\.bot-action-button/);
  assert.match(css, /\.command-toggle-list/);
  assert.match(css, /\.invite-activity-grid/);
  assert.match(css, /\.invite-leaderboard/);
  assert.match(css, /\.invite-leaderboard-row/);
  assert.match(css, /\.bot-capability-list/);
  assert.match(css, /\.bot-capability/);
});

test("runtime events live in their own tab", () => {
  const nav = html.match(/<nav class="tabs main-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  const overview = html.match(/<section class="overview-panel panel"[\s\S]*?<\/section>\s*<nav/s)?.[0] ?? "";
  const runtimeView = html.match(/id="runtime-view"[\s\S]*?<\/section>/)?.[0] ?? "";
  const botView = html.match(/id="bot-view"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(nav, /data-route="runtime"[^>]*>运行日志</);
  assert.match(runtimeView, /data-view="runtime"/);
  assert.match(runtimeView, /id="runtime-events"/);
  assert.match(runtimeView, /class="runtime-events"/);
  assert.match(runtimeView, /最近事件/);
  assert.doesNotMatch(overview, /id="runtime-events"/);
  assert.doesNotMatch(botView, /id="runtime-events"/);
  assert.match(js, /loadRuntimeEvents/);
  assert.match(js, /renderRuntimeEvents/);
  assert.match(js, /\/api\/runtime\/events/);
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
  assert.match(css, /\.balance-list\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.balance-item\s*{[^}]*flex:\s*1 1/s);
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
  assert.match(html, /class="app-shell[^"]*page-shell[^"]*"/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="command-panel"/);
  assert.match(html, /class="service-status-row"/);
  assert.match(html, /class="balance-row"/);
  assert.match(html, /class="workspace"/);
  assert.match(html, /class="settings-grid"/);
  assert.match(html, /class="collection-header"/);
  assert.match(html, /class="source-ledger"/);
});

test("pub UI uses a CPA2sub2API inspired glass workspace layout", () => {
  assert.match(html, /class="topbar console-header"/);
  assert.match(html, /class="overview-panel panel"/);
  assert.match(html, /class="overview-head"/);
  assert.match(html, /class="overview-layout"/);
  assert.match(html, /class="overview-primary"/);
  assert.match(html, /class="view-stack"/);
  assert.match(html, /overview-panel[\s\S]*service-status-row[\s\S]*balance-row[\s\S]*main-nav/);
  assert.doesNotMatch(html, /class="quick-actions"/);
  assert.doesNotMatch(html, /class="quick-action"/);
  assert.match(css, /\.page-shell/);
  assert.match(css, /\.console-header/);
  assert.match(css, /\.overview-panel/);
  assert.match(css, /\.overview-layout/);
  assert.match(css, /\.overview-primary/);
  assert.doesNotMatch(css, /\.quick-actions/);
  assert.doesNotMatch(css, /\.quick-action/);
  assert.match(css, /\.view-stack/);
  assert.match(css, /border-radius:\s*18px/);
  assert.match(css, /backdrop-filter:\s*blur\(14px\)/);
  assert.doesNotMatch(html, /class="topbar hero-panel"/);
});

test("pub UI applies the CPA2sub2API inspired light green operations theme", () => {
  assert.match(html, /href="\/cyberpunk\.css"/);
  assert.match(html, /class="cyber-grid"/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /--bg:\s*#ede6d9/);
  assert.match(css, /--accent:\s*#176d59/);
  assert.match(css, /--panel:\s*rgba\(250,\s*246,\s*239,\s*0\.78\)/);
  assert.match(css, /--text:\s*#1f1b17/);
  assert.match(css, /--signal-green/);
  assert.match(css, /--signal-amber/);
  assert.doesNotMatch(css, /--bg:\s*#070a12/);
  assert.doesNotMatch(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(css, /--neon-magenta/);
  assert.doesNotMatch(css, /--neon-lime/);
});

test("pub UI keeps a centered application frame", () => {
  assert.match(html, /class="app-shell vercel-frame page-shell"/);
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
  assert.match(css, /\.cyber-grid \.service-status-indicator\[data-tone="success"\]/);
  assert.match(css, /\.cyber-grid \.service-status-indicator\[data-tone="error"\]/);
  assert.match(css, /\.cyber-grid \.status-tile\[data-tone="success"\]/);
  assert.match(css, /\.cyber-grid \.status-tile\[data-tone="error"\]/);
  assert.match(css, /\.cyber-grid \.pill\.success/);
  assert.match(css, /\.cyber-grid \.pill\.error/);
  assert.match(css, /\.cyber-grid \.source-message\[data-tone="success"\]/);
  assert.match(css, /\.account-state\.success/);
  assert.match(css, /\.account-state\.error/);
  assert.match(js, /statusTone/);
  assert.match(js, /target\.indicator\.dataset\.tone = statusTone\(serviceState\)/);
  assert.match(js, /showBotMessage\("机器人配置已保存", "success"\)/);
  assert.match(js, /showSourceMessage\(deps, "已保存并读取倍率", "success"\)/);
});
