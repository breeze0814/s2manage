import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync("src/components/app/shell.tsx", "utf8");
const botPanelSource = [
  readFileSync("src/components/app/bot-management-panel.tsx", "utf8"),
  readFileSync("src/components/app/bot-management-panel-parts.tsx", "utf8"),
  readFileSync("src/components/app/bot-management-logs-card.tsx", "utf8"),
].join("\n");
const botPanelMainSource = readFileSync("src/components/app/bot-management-panel.tsx", "utf8");
const botActivitySource = [
  readFileSync("src/components/app/bot-activity-panel.tsx", "utf8"),
  readFileSync("src/components/app/bot-activity-panel-parts.tsx", "utf8"),
].join("\n");

assert.match(shellSource, /BotManagementPanel/, "Shell should import and render the Bot management panel");
assert.match(shellSource, /id:\s*"bot-management"/, "Shell should register a bot-management tab");
assert.match(shellSource, /label:\s*"Bot 管理"/, "Bot management tab should use the approved label");

assert.match(botPanelSource, /QQBot 管理/, "Bot panel should be focused on QQBot management");
assert.match(botPanelSource, /compactBotLayout/, "Bot panel should use the compact layout variant");
assert.match(botPanelSource, /PanelHeader/, "Bot panel should use the shared PanelHeader layout");
assert.match(botPanelSource, /PanelActions/, "Bot panel header actions should use the shared PanelActions wrapper");
assert.match(botActivitySource, /MetricCard/, "Bot activity metrics should use the shared MetricCard component");
assert.match(botActivitySource, /LoadingState/, "Bot activity loading feedback should use the shared LoadingState component");
assert.match(botPanelSource, /EmptyState/, "Bot logs should use the shared EmptyState component");
assert.match(botActivitySource, /EmptyState/, "Bot activity empty feedback should use the shared EmptyState component");
assert.match(botPanelSource, /BotActivityPanel/, "Bot panel should include the activity module");
assert.match(botPanelSource, /botOpsLeftColumn/, "Bot panel should keep test and feature controls in the left column");
assert.match(botPanelSource, /botLogsRightColumn/, "Bot panel should keep WebSocket logs in the right column");
assert.match(botPanelMainSource, /bot-management-logs-card/, "Bot panel should import the separated WebSocket log card");
assert.match(botPanelSource, /useRef<HTMLDivElement>/, "Bot panel should keep a log container ref for automatic scrolling");
assert.match(botPanelSource, /scrollTop\s*=\s*logContainer\.scrollHeight/, "Bot panel should auto-scroll logs to the newest entry");
assert.match(botPanelSource, /基本配置/, "Bot panel should keep a compact basic configuration section");
assert.match(botActivitySource, /活动/, "Bot activity panel should expose the activity section");
assert.match(botActivitySource, /启用邀请活动/, "Bot activity panel should expose the invite activity switch");
assert.match(botActivitySource, /DialogTrigger/, "Invite activity should open from a dialog trigger");
assert.match(botActivitySource, /DialogContent/, "Invite activity details should render inside a dialog");
assert.match(botActivitySource, /DialogBody/, "Invite activity dialog should use the shared scrollable dialog body");
assert.match(botActivitySource, /邀请活动排行榜/, "Bot activity panel should render the leaderboard");
assert.match(botActivitySource, /@bot 邀请/, "Bot activity panel should describe the invite command");
assert.match(botActivitySource, /三日周期/, "Bot activity panel should display the three-day reward period");
assert.match(botPanelSource, /功能与指令/, "Bot panel should combine feature controls and command reference");
assert.doesNotMatch(botPanelSource, /测试分析/, "Bot panel should not expose the test analysis module");
assert.doesNotMatch(botPanelSource, /sendTestAnalysis/, "Bot panel should not call the test analysis endpoint from the UI");
assert.doesNotMatch(botPanelSource, /liveRateTestEnabled/, "Bot panel should not keep the test-analysis switch in UI state");
assert.doesNotMatch(botPanelSource, /testMessageTemplate/, "Bot panel should not keep the test-analysis template in UI state");
assert.match(botPanelSource, /WS 实时日志/, "Bot panel should include the WebSocket live log section");
assert.match(botPanelSource, /max-h-\[60dvh\]/, "WebSocket log console should use viewport-based height instead of a fixed desktop height");
assert.match(botPanelSource, /当前 WS 状态/, "Bot panel should show the current WebSocket connection status");
assert.match(botPanelSource, /listenerStatusText/, "Bot panel should render a readable WebSocket status label");
assert.doesNotMatch(botPanelSource, /sm:flex-row sm:items-center sm:justify-between/,
  "Bot management header and helper rows should not compress into one row at the narrow tablet breakpoint");
assert.match(botPanelSource, /lg:flex-row lg:items-center lg:justify-between/,
  "Bot management header and helper rows should wait until the large breakpoint before using a horizontal layout");
assert.doesNotMatch(botPanelSource, /sm:grid-cols-2/,
  "Bot WebSocket status details should stay single-column on phones and only densify from the tablet breakpoint");
assert.match(botPanelSource, /md:grid-cols-2/,
  "Bot WebSocket status details should use two columns from the tablet breakpoint");
assert.doesNotMatch(botPanelSource, /sm:grid-cols-\[72px_132px_minmax\(0,1fr\)\]/,
  "Bot WebSocket log rows should not force a three-column log layout at the small breakpoint");
assert.match(botPanelSource, /lg:grid-cols-\[72px_132px_minmax\(0,1fr\)\]/,
  "Bot WebSocket log rows should wait until the large breakpoint before using a three-column layout");
assert.match(botPanelSource, /群组列表/, "Bot panel should show QQ groups as a selectable list");
assert.match(botPanelSource, /消息发送/, "Bot panel should include a direct message sending box");
assert.match(botPanelSource, /SelectTrigger/, "Bot panel should use a select control for QQ groups");
assert.match(botPanelSource, /实时接收 NapCat WebSocket 消息/, "WebSocket log should describe live NapCat message streaming");
assert.match(botPanelSource, /支持的 @Bot 指令/, "Bot panel should show the actual command list");
assert.doesNotMatch(botPanelSource, /最近变动：返回最近分组倍率变动/, "Bot panel should not advertise an unimplemented recent-change command");
assert.match(botPanelSource, /启用 QQBot/, "Feature list should expose the QQBot enable switch");
assert.match(botPanelSource, /分组倍率变动推送/, "Feature list should expose rate-change push");
assert.match(botPanelSource, /@ 关键字触发/, "Feature list should expose mention keyword trigger");
assert.match(botPanelSource, /目标 QQ 群号/, "Basic configuration should collect the target QQ group id");
assert.match(botPanelSource, /NapCat Token/, "Bot panel should collect the optional NapCat token");
assert.doesNotMatch(botPanelSource, /Telegram/i, "Bot panel should not expose Telegram configuration yet");
assert.doesNotMatch(botPanelSource, /自动重连/, "Bot panel should not expose advanced reconnect settings yet");
assert.doesNotMatch(botPanelSource, /API 超时/, "Bot panel should not expose advanced NapLink API settings yet");
assert.doesNotMatch(botPanelSource, /重连倍率/, "Bot panel should not expose advanced reconnect backoff settings yet");
