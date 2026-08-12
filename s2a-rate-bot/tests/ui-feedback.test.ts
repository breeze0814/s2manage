import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string) {
  const file = new URL(path, ROOT);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

test("transient system feedback uses shadcn Sonner alerts instead of inline messages", () => {
  const pkg = JSON.parse(source("package.json")) as { dependencies?: Record<string, string> };
  const layout = source("src/app/layout.tsx");
  const frame = source("src/components/application-frame.tsx");
  const toaster = source("src/components/ui/sonner.tsx");
  const confirmAlert = source("src/components/ui/confirm-alert.tsx");
  const dashboards = [
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/groups/groups-dashboard.tsx",
    "src/components/sources/sources-dashboard.tsx",
  ].map(source).join("\n");
  const feedbackSources = [
    "src/components/accounts/use-accounts-dashboard.ts",
    "src/components/groups/use-groups-dashboard.ts",
    "src/components/sources/use-sources-dashboard.ts",
    "src/components/settings-form.tsx",
    "src/components/home/home-dashboard.tsx",
  ].map(source).join("\n");

  assert.ok(pkg.dependencies?.sonner);
  assert.ok(pkg.dependencies?.["@radix-ui/react-alert-dialog"]);
  assert.match(layout, /ApplicationFrame/);
  assert.match(frame, /<Toaster \/>/);
  assert.match(toaster, /Toaster as Sonner/);
  assert.match(toaster, /position="top-center"/);
  assert.match(confirmAlert, /@radix-ui\/react-alert-dialog/);
  assert.match(feedbackSources, /toast\.success/);
  assert.match(feedbackSources, /toast\.error/);
  assert.doesNotMatch(dashboards, /view\.message/);
  assert.doesNotMatch(feedbackSources, /setMessage|FeedbackMessage|window\.confirm/);
});

test("dialog forms close only after a successful save", () => {
  const settingsDialog = source("src/components/settings-dialog.tsx");
  const settingsForm = source("src/components/settings-form.tsx");
  const groupDialog = source("src/components/groups/group-rule-dialog.tsx");
  const groupHook = source("src/components/groups/use-groups-dashboard.ts");
  const sourceHook = source("src/components/sources/use-sources-dashboard.ts");

  assert.match(settingsDialog, /open=\{open\}/);
  assert.match(settingsDialog, /onSaved=\{\(\) => setOpen\(false\)\}/);
  assert.match(settingsForm, /onSaved\?: \(\) => void/);
  assert.match(settingsForm, /input\.onSaved\?\.\(\)/);
  assert.match(groupDialog, /await onSave\(group\.id, draft\)/);
  assert.match(groupDialog, /setOpen\(false\)/);
  assert.match(groupHook, /Promise<boolean>/);
  assert.match(groupHook, /return true/);
  assert.match(groupHook, /return false/);
  assert.match(sourceHook, /setDialog\(\{ open: false, site: null \}\)/);
});

test("settings and notification navigation are keyboard-accessible tab sets", () => {
  const form = source("src/components/settings-form.tsx");
  const navigation = source("src/components/settings-navigation.tsx");
  const channels = source("src/components/notification-channels-fields.tsx");
  const worker = source("src/components/worker-status-panel.tsx");

  assert.match(navigation, /role="tablist"/);
  assert.match(navigation, /role="tab"/);
  assert.match(navigation, /aria-controls=/);
  assert.match(navigation, /ArrowRight/);
  assert.match(form, /role="tabpanel"/);
  assert.match(form, /settings-page/);
  assert.match(form, /settings-dialog/);
  assert.match(channels, /useId/);
  assert.match(channels, /role="tabpanel"/);
  assert.match(channels, /ArrowRight/);
  assert.match(worker, /role="alert"/);
  assert.match(worker, /setError/);
});

test("centered dialogs preserve their position during open and close animations", () => {
  const styles = source("src/app/globals.css") + source("src/app/design-system.css");
  const dialogPrimitive = source("src/components/ui/dialog.tsx");
  const dialogs = [
    "src/components/auth-dialog.tsx",
    "src/components/settings-dialog.tsx",
    "src/components/groups/group-rule-dialog.tsx",
    "src/components/sources/source-site-dialog.tsx",
    "src/components/engagement/embed-settings-dialog.tsx",
    "src/components/engagement/lottery-form.tsx",
    "src/components/ui/confirm-alert.tsx",
  ].map(source).join("\n");

  assert.match(styles, /@keyframes dialog-content-in/);
  assert.match(styles, /@keyframes dialog-content-out/);
  assert.match(styles, /\.dialog-content-motion/);
  assert.match(dialogPrimitive, /dialog-content-motion/);
  assert.match(dialogPrimitive, /@radix-ui\/react-dialog/);
  assert.ok((dialogs.match(/ui\/dialog/g) ?? []).length >= 6);
  assert.doesNotMatch(dialogs, /zoom-(?:in|out)-95/);
});

test("engagement settings and lottery editing use accessible modal dialogs", () => {
  const settings = source("src/components/engagement/embed-settings-dialog.tsx");
  const lotteryForm = source("src/components/engagement/lottery-form.tsx");
  const lotteryFormSections = source("src/components/engagement/lottery-form-sections.tsx");
  const lotteryPrizeFields = source("src/components/engagement/lottery-prize-fields.tsx");
  const lotteryEditor = [lotteryForm, lotteryFormSections, lotteryPrizeFields].join("\n");
  const eligibilityFields = source("src/components/engagement/lottery-eligibility-fields.tsx");
  const dashboards = [
    "src/components/engagement/tickets-dashboard.tsx",
    "src/components/engagement/leaderboard-dashboard.tsx",
    "src/components/engagement/lottery-dashboard.tsx",
  ].map(source).join("\n");

  assert.match(settings, /from "\.\.\/ui\/dialog"/);
  assert.match(settings, /DialogTrigger asChild/);
  assert.match(settings, /嵌入设置/);
  assert.match(settings, /max-h-\[92dvh\]/);
  assert.match(lotteryForm, /from "\.\.\/ui\/dialog"/);
  assert.match(lotteryForm, /DialogContent/);
  assert.match(lotteryForm, /新建抽奖活动/);
  assert.match(lotteryForm, /overscroll-contain/);
  assert.match(lotteryForm, /safe-area-inset-bottom/);
  assert.match(lotteryForm, /md:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(lotteryForm, /min-\[360px\]:grid-cols-2/);
  assert.match(lotteryForm, /hidden min-w-0 truncate text-xs/);
  assert.match(lotteryForm, /aria-busy=\{saving\}/);
  assert.match(lotteryForm, /lottery-form-error/);
  assert.match(lotteryForm, /errorRef\.current\?\.focus\(\)/);
  assert.match(lotteryForm, /!open && !saving/);
  assert.match(lotteryFormSections, /活动信息/);
  assert.match(lotteryFormSections, /参与规则/);
  assert.match(lotteryFormSections, /label="活动名称" required/);
  assert.match(lotteryEditor, /RadioGroup/);
  assert.match(lotteryFormSections, /focus-within:ring-2/);
  assert.doesNotMatch(lotteryFormSections, /RadioGroupItem[^>]+className="sr-only"/);
  assert.match(lotteryEditor, /即时开奖/);
  assert.match(lotteryEditor, /定时开奖/);
  assert.match(lotteryFormSections, /参与频率/);
  assert.match(lotteryFormSections, /每日一次/);
  assert.match(lotteryFormSections, /活动期间一次/);
  assert.match(lotteryFormSections, /上海自然日/);
  assert.match(lotteryPrizeFields, /奖品设置/);
  assert.match(lotteryPrizeFields, /奖励类型/);
  assert.match(lotteryPrizeFields, /奖励额度/);
  assert.match(lotteryPrizeFields, /transition-\[width\]/);
  assert.match(lotteryPrizeFields, /inputMode="decimal"/);
  assert.match(lotteryPrizeFields, /aria-live="polite"/);
  assert.match(lotteryPrizeFields, /label="奖品名称" required/);
  assert.match(lotteryFormSections, /lottery-visible-to-users/);
  assert.match(lotteryFormSections, /lottery-public-winners/);
  assert.match(lotteryFormSections, /Switch/);
  assert.match(lotteryFormSections, /LotteryEligibilityFields/);
  assert.match(eligibilityFields, /当前余额大于 X/);
  assert.match(eligibilityFields, /当天使用过兑换码/);
  assert.match(eligibilityFields, /当天邀请过好友/);
  assert.match(eligibilityFields, /Checkbox/);
  assert.match(eligibilityFields, /aria-describedby="lottery-eligibility-description"/);
  assert.doesNotMatch(lotteryEditor, /奖品权重|手动开奖/);
  assert.match(dashboards, /EngagementPageHeader/);
  assert.doesNotMatch(dashboards, /<EmbedLinkPanel|<TicketConfigPanel/);
});

test("ticket detail keeps the reply controls visible while long conversations scroll", () => {
  const dashboard = source("src/components/engagement/tickets-dashboard.tsx");
  const detail = source("src/components/engagement/ticket-detail-panel.tsx");

  assert.match(dashboard, /onClose=\{\(\) => setSelected\(null\)\}/);
  assert.match(detail, /aria-label="关闭工单详情"/);
  assert.match(detail, /xl:top-\[var\(--workspace-top\)\]/);
  assert.match(detail, /xl:h-\[calc\(100dvh-var\(--workspace-top\)-1rem\)\]/);
  assert.match(detail, /xl:min-h-0 xl:max-h-none xl:flex-1/);
});

test("ticket queue uses compact cards before the desktop table breakpoint", () => {
  const dashboard = source("src/components/engagement/tickets-dashboard.tsx");

  assert.match(dashboard, /TicketCard/);
  assert.match(dashboard, /space-y-2\.5 p-3 lg:hidden/);
  assert.match(dashboard, /hidden overflow-auto xl:border-r xl:border-border lg:block/);
  assert.match(dashboard, /aria-pressed=\{selected\}/);
  assert.match(dashboard, /className="h-auto min-h-0 min-w-0 flex-1 justify-start truncate/);
  assert.match(dashboard, /matchMedia\("\(max-width: 1023px\)"\)/);
  assert.match(dashboard, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source("src\/components\/engagement\/ticket-detail-panel.tsx"), /id="ticket-detail-panel"/);
});

test("embedded pages expose retries and readable narrow-screen results", () => {
  const state = source("src/components/embed/embed-state.tsx");
  const lottery = source("src/components/embed/lottery-embed-page.tsx");
  const tickets = source("src/components/embed/tickets-embed-page.tsx");
  const leaderboard = source("src/components/embed/leaderboard-embed-page.tsx");
  const table = source("src/components/engagement/leaderboard-table.tsx");

  assert.match(state, /EmbedInlineError/);
  assert.match(state, /retryLabel/);
  assert.match(lottery, /重新加载活动/);
  assert.match(tickets, /重新读取工单/);
  assert.match(leaderboard, /重新读取排行榜/);
  assert.match(tickets, /ImageOff/);
  assert.match(tickets, /加载失败/);
  assert.match(table, /LeaderboardMobileRow/);
  assert.match(table, /divide-y divide-border md:hidden/);
  assert.match(table, /hidden overflow-auto md:block/);
  assert.match(table, /第 \{row\.rank\} 名/);
});

test("core data workspaces distinguish failed loading from an empty result", () => {
  const sharedError = source("src/components/ui/data-load-error.tsx");
  const accounts = source("src/components/accounts/accounts-dashboard.tsx");
  const accountData = source("src/components/accounts/use-accounts-dashboard.ts");
  const groups = source("src/components/groups/groups-dashboard.tsx");
  const groupData = source("src/components/groups/use-groups-dashboard.ts");
  const sources = source("src/components/sources/sources-dashboard.tsx");
  const sourceData = source("src/components/sources/use-sources-dashboard.ts");

  assert.match(sharedError, /role="alert"/);
  assert.match(sharedError, /重试/);
  assert.match(sharedError, /pending/);
  assert.match(accounts, /view\.loadError && view\.accounts\.length === 0/);
  assert.match(accounts, /账号数据刷新失败/);
  assert.match(accountData, /setLoadError/);
  assert.match(groups, /view\.loadError && view\.groups\.length === 0/);
  assert.match(groups, /分组数据刷新失败/);
  assert.match(groupData, /setLoadError/);
  assert.match(sources, /view\.loadError && !hasData/);
  assert.match(sources, /采集数据刷新失败/);
  assert.match(sourceData, /setLoadError/);
});

test("engagement workspaces expose a retry path without discarding loaded context", () => {
  const compensation = source("src/components/engagement/compensation-dashboard.tsx");
  const leaderboard = source("src/components/engagement/leaderboard-dashboard.tsx");
  const lottery = source("src/components/engagement/lottery-dashboard.tsx");
  const tickets = source("src/components/engagement/tickets-dashboard.tsx");

  for (const page of [compensation, leaderboard, lottery, tickets]) assert.match(page, /DataLoadError/);
  assert.match(compensation, /订单补偿数据刷新失败/);
  assert.match(leaderboard, /排行榜刷新失败/);
  assert.match(lottery, /抽奖活动刷新失败/);
  assert.match(tickets, /工单队列刷新失败/);
  assert.match(compensation, /setError/);
  assert.match(leaderboard, /setError/);
  assert.match(lottery, /setError/);
  assert.match(tickets, /setError/);
});

test("embed administration panels recover from initial configuration failures", () => {
  const links = source("src/components/engagement/embed-link-panel.tsx");
  const ticketConfig = source("src/components/engagement/ticket-config-panel.tsx");

  assert.match(links, /DataLoadError/);
  assert.match(links, /嵌入链接加载失败/);
  assert.match(links, /嵌入链接刷新失败/);
  assert.match(links, /setError/);
  assert.match(ticketConfig, /DataLoadError/);
  assert.match(ticketConfig, /工单表单设置加载失败/);
  assert.match(ticketConfig, /工单表单设置刷新失败/);
  assert.match(ticketConfig, /setError/);
});

test("customer lottery hides participant and winner counts while showing remaining prizes", () => {
  const customerLottery = source("src/components/embed/lottery-embed-page.tsx");
  const lotteryWheel = source("src/components/embed/lottery-wheel.tsx");
  const operationsLottery = source("src/components/engagement/lottery-dashboard.tsx");
  const eligibilitySummary = source("src/components/lottery-eligibility-summary.tsx");

  assert.doesNotMatch(customerLottery, /entryCount|winnerCount|人参与|中奖人数/);
  assert.match(customerLottery, /PrizeInventoryPreview/);
  assert.match(customerLottery, /当前剩余奖品/);
  assert.match(customerLottery, /剩余奖品/);
  assert.match(customerLottery, /totalRemainingPrizes/);
  assert.match(customerLottery, /item\.remaining/);
  assert.match(customerLottery, /inventory\?\.remaining/);
  assert.match(customerLottery, /LotteryEligibilitySummary/);
  assert.match(customerLottery, /lotteryParticipationLabel/);
  assert.match(customerLottery, /ParticipationHistory/);
  assert.match(customerLottery, /myEntries/);
  assert.match(eligibilitySummary, /lotteryEligibilityRequirement/);
  assert.match(customerLottery, /LotteryWheel/);
  assert.match(lotteryWheel, /conic-gradient/);
  assert.match(lotteryWheel, /prefers-reduced-motion/);
  assert.match(lotteryWheel, /resultSegmentIndex/);
  assert.match(operationsLottery, /累计参与/);
  assert.match(operationsLottery, /LotteryEligibilitySummary/);
  assert.doesNotMatch(operationsLottery, /参与余额 &gt; 10/);
  assert.match(operationsLottery, /set-visibility/);
  assert.match(operationsLottery, /<Switch/);
});
