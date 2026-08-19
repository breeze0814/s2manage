import { z } from "zod";
import type { TelegramBotClient, TelegramMessageInput } from "../../adapters/telegram-bot.ts";
import type { CollectionChangesQuery } from "../collection/history.ts";
import type { CollectionRateChange, CollectionSiteView } from "../collection/types.ts";
import type { TelegramStateStore } from "./state-store.ts";
import type { NotificationDispatcher } from "../notifications/dispatcher.ts";

const BALANCE_INTERVAL_MS = 60 * 60 * 1_000;
const RATE_CHANGE_PAGE_SIZE = 100;
const TELEGRAM_MESSAGE_MAX_LENGTH = 4_096;
const CHINA_TIME_ZONE = "Asia/Shanghai";

const testSettingsSchema = z.object({
  botToken: z.string().trim().default(""),
  chatId: z.string().trim().default(""),
});

export type TelegramRuntimeSettings = {
  readonly botToken: string;
  readonly chatId: string;
  readonly hourlyBalanceEnabled: boolean;
  readonly rateChangeEnabled: boolean;
  readonly timeoutMs: number;
  readonly proxyUrl: string | null;
};

export type NotificationStats = {
  readonly success: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly string[];
};

export type SiteRefreshIssue = {
  readonly siteId: number;
  readonly siteName: string;
  readonly status: "failed" | "partial";
  readonly error: string;
};

export type NotificationRunInput = {
  readonly refreshIssues?: readonly SiteRefreshIssue[];
};

export type TelegramNotificationService = {
  readonly run: (input?: NotificationRunInput) => Promise<NotificationStats>;
  readonly test: (input: unknown) => Promise<void>;
  readonly close: () => void;
};

export function createTelegramNotificationService(input: {
  readonly settings: () => Promise<TelegramRuntimeSettings>;
  readonly collection: TelegramCollection;
  readonly state: TelegramStateStore;
  readonly client: TelegramBotClient;
  readonly dispatcher?: NotificationDispatcher;
  readonly now: () => Date;
}): TelegramNotificationService {
  return {
    run: (runInput) => runNotifications(input, runInput),
    test: (raw) => testNotification(input, raw),
    close: () => input.state.close(),
  };
}

async function runNotifications(input: TelegramDependencies, runInput: NotificationRunInput = {}) {
  const settings = await input.settings();
  const issues = runInput.refreshIssues ?? [];
  const refreshIssues = issues.length
    ? await captureTask("站点刷新异常推送", () => pushRefreshIssues(input, settings, issues))
    : null;
  const balance = settings.hourlyBalanceEnabled
    ? await captureTask("账户余额推送", () => pushBalance(input, settings))
    : skippedStats();
  const rateChanges = settings.rateChangeEnabled
    ? await captureTask("分组倍率变动推送", () => pushRateChanges(input, settings))
    : skippedStats();
  return mergeStats(...(refreshIssues ? [refreshIssues, balance, rateChanges] : [balance, rateChanges]));
}

async function testNotification(input: TelegramDependencies, raw: unknown) {
  const current = await input.settings();
  const provided = testSettingsSchema.parse(raw);
  await input.client.sendMessage(messageInput(current, {
    botToken: provided.botToken || current.botToken,
    chatId: provided.chatId || current.chatId,
    text: `${notificationHeader("通知测试", input.now())}\n\n通知通道连接正常。`,
  }));
}

async function pushRefreshIssues(
  input: TelegramDependencies,
  settings: TelegramRuntimeSettings,
  issues: readonly SiteRefreshIssue[],
): Promise<NotificationStats> {
  const header = `${notificationHeader("站点刷新异常", input.now())}\n\n异常明细：`;
  const messages = messageBatches(header, refreshIssueLines(issues)).map((batch) => batch.text);
  for (const text of messages) await sendNotification(input, settings, text);
  return successStats(messages.length);
}

async function pushBalance(input: TelegramDependencies, settings: TelegramRuntimeSettings): Promise<NotificationStats> {
  const state = await input.state.get();
  if (!balanceDue(state.lastBalancePushAt, input.now())) return skippedStats();
  const sites = (await input.collection.list()).filter((site) => site.enabled);
  const total = sites.reduce((sum, site) => sum + (site.balance ?? 0), 0);
  const header = `${notificationHeader("采集站账户余额", input.now())}\n\n总余额：${formatNumber(total)}\n\n站点明细：`;
  const messages = messageBatches(header, balanceLines(sites)).map((batch) => batch.text);
  for (const text of messages) await sendNotification(input, settings, text);
  await input.state.markBalancePushed(input.now().toISOString());
  return successStats(messages.length);
}

async function pushRateChanges(input: TelegramDependencies, settings: TelegramRuntimeSettings): Promise<NotificationStats> {
  let cursor = (await input.state.get()).lastRateChangeId;
  if (cursor === null) return initializeRateCursor(input);
  let sent = 0;
  while (true) {
    const changes = await input.collection.changes({ afterId: cursor, limit: RATE_CHANGE_PAGE_SIZE });
    if (!changes.length) return sent ? successStats(sent) : skippedStats();
    const header = `${notificationHeader("分组倍率变动", input.now())}\n\n变动明细：`;
    for (const batch of messageBatches(header, rateChangeLines(changes))) {
      await sendNotification(input, settings, batch.text);
      cursor = batch.lastId;
      await input.state.markRateChangesPushed(cursor);
      sent += 1;
    }
    if (changes.length < RATE_CHANGE_PAGE_SIZE) return successStats(sent);
  }
}

async function initializeRateCursor(input: TelegramDependencies) {
  const [latest] = await input.collection.changes({ limit: 1 });
  await input.state.markRateChangesPushed(latest?.id ?? 0);
  return skippedStats();
}

function messageBatches(header: string, entries: readonly MessageEntry[]) {
  const batches: MessageBatch[] = [];
  let lines: string[] = [];
  let lastId = 0;
  for (const entry of entries.length ? entries : [{ line: "暂无已启用采集站。", id: 0 }]) {
    const candidate = [header, ...lines, entry.line].join("\n");
    if (candidate.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
      lines = [...lines, entry.line];
      lastId = entry.id;
      continue;
    }
    if (!lines.length) throw new Error("单条 Telegram 通知超过 4096 字符限制");
    batches.push({ text: [header, ...lines].join("\n"), lastId });
    lines = [entry.line];
    lastId = entry.id;
  }
  batches.push({ text: [header, ...lines].join("\n"), lastId });
  return batches;
}

function balanceLines(sites: readonly CollectionSiteView[]): MessageEntry[] {
  return sites.map((site) => ({
    id: site.id,
    line: `- ${site.name}${site.accountLabel ? `（${site.accountLabel}）` : ""}：${site.balance === null ? "未采集" : formatNumber(site.balance)}`,
  }));
}

function refreshIssueLines(issues: readonly SiteRefreshIssue[]): MessageEntry[] {
  return issues.map((issue) => ({
    id: issue.siteId,
    line: `- ${issue.siteName}（ID: ${issue.siteId}，${issue.status === "failed" ? "刷新失败" : "部分失败"}）：${issue.error}`,
  }));
}

function rateChangeLines(changes: readonly CollectionRateChange[]): MessageEntry[] {
  return changes.map((change) => ({ id: change.id, line: `- ${change.sourceSiteName} / ${change.groupName}：${rateDescription(change)}` }));
}

function rateDescription(change: CollectionRateChange) {
  if (change.changeType === "added") return `新增倍率 ${formatNumber(change.newRate!)}`;
  if (change.changeType === "deleted") return `删除倍率 ${formatNumber(change.oldRate!)}`;
  return `倍率 ${formatNumber(change.oldRate!)} → ${formatNumber(change.newRate!)}`;
}

function messageInput(settings: TelegramRuntimeSettings, values: Readonly<{ text: string; botToken?: string; chatId?: string }>): TelegramMessageInput {
  return { botToken: values.botToken ?? settings.botToken, chatId: values.chatId ?? settings.chatId,
    text: values.text, timeoutMs: settings.timeoutMs, proxyUrl: settings.proxyUrl };
}

async function sendNotification(input: TelegramDependencies, settings: TelegramRuntimeSettings, text: string) {
  if (!input.dispatcher) return input.client.sendMessage(messageInput(settings, { text }));
  const result = await input.dispatcher.send(text);
  if (result.failed.length) throw new Error(result.failed.join("; "));
  if (result.sent === 0) throw new Error("未配置启用的通知机器人");
}

async function captureTask(label: string, task: () => Promise<NotificationStats>) {
  try { return await task(); } catch (error) {
    return { success: 0, skipped: 0, failed: 1, errors: [`${label}: ${errorMessage(error)}`] };
  }
}

function balanceDue(lastPushAt: string | null, now: Date) {
  if (!lastPushAt) return true;
  const timestamp = new Date(lastPushAt).getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`无效的 Telegram 余额推送时间: ${lastPushAt}`);
  return timestamp + BALANCE_INTERVAL_MS <= now.getTime();
}

function mergeStats(...stats: readonly NotificationStats[]): NotificationStats {
  return stats.reduce((result, item) => ({ success: result.success + item.success,
    skipped: result.skipped + item.skipped, failed: result.failed + item.failed,
    errors: [...result.errors, ...item.errors] }), { success: 0, skipped: 0, failed: 0, errors: [] as string[] });
}

function successStats(count: number): NotificationStats { return { success: count, skipped: 0, failed: 0, errors: [] }; }
function skippedStats(): NotificationStats { return { success: 0, skipped: 1, failed: 0, errors: [] }; }
function formatNumber(value: number) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(value); }
function formatTime(value: Date) { return value.toLocaleString("zh-CN", { timeZone: CHINA_TIME_ZONE, hour12: false }); }
function notificationHeader(title: string, now: Date) { return `【S2A Rate Bot】${title}\n时间：${formatTime(now)}`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

type MessageEntry = { readonly id: number; readonly line: string };
type MessageBatch = { readonly text: string; readonly lastId: number };
type TelegramCollection = {
  readonly list: () => Promise<readonly CollectionSiteView[]>;
  readonly changes: (query?: CollectionChangesQuery) => Promise<readonly CollectionRateChange[]>;
};
type TelegramDependencies = Parameters<typeof createTelegramNotificationService>[0];
