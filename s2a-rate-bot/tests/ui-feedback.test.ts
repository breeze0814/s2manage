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
