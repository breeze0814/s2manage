import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createTelegramBotClient } from "../src/adapters/telegram-bot.ts";
import { safeRequestUrl, type JsonRequest } from "../src/adapters/http-client.ts";
import { createTelegramNotificationService, type TelegramRuntimeSettings } from "../src/server/telegram/service.ts";
import { createSqliteTelegramStateStore, type TelegramNotificationState, type TelegramStateStore } from "../src/server/telegram/state-store.ts";

const NOW = new Date("2026-07-21T04:00:00.000Z");
const SETTINGS: TelegramRuntimeSettings = {
  botToken: "123456:telegram-test-token",
  chatId: "-1001234567890",
  hourlyBalanceEnabled: true,
  rateChangeEnabled: true,
  timeoutMs: 25_000,
  proxyUrl: null,
};

test("Telegram client sends Bot API payload and redacts its token from logs", async () => {
  let request: JsonRequest | undefined;
  const client = createTelegramBotClient({
    request: async <T>(input: JsonRequest) => {
      request = input;
      return { ok: true } as T;
    },
  });
  await client.sendMessage({ ...SETTINGS, text: "test" });
  assert.equal(request?.url, "https://api.telegram.org/bot123456:telegram-test-token/sendMessage");
  assert.deepEqual(request?.body, { chat_id: SETTINGS.chatId, text: "test", disable_web_page_preview: true });
  assert.equal(safeRequestUrl(request!.url), "https://api.telegram.org/bot[redacted]/sendMessage");
});

test("Telegram client exposes Bot API failures", async () => {
  const client = createTelegramBotClient({ request: async <T>() => ({ ok: false, description: "chat not found" }) as T });
  await assert.rejects(client.sendMessage({ ...SETTINGS, text: "test" }), /chat not found/);
});

test("SQLite notification state preserves independent cursors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-telegram-state-"));
  const store = createSqliteTelegramStateStore(`file:${join(directory, "app.db")}`);
  try {
    assert.deepEqual(await store.get(), { lastBalancePushAt: null, lastRateChangeId: null });
    await store.markBalancePushed(NOW.toISOString());
    await store.markRateChangesPushed(14);
    assert.deepEqual(await store.get(), { lastBalancePushAt: NOW.toISOString(), lastRateChangeId: 14 });
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("notifications push hourly balances and only future rate changes", async () => {
  const state = memoryState();
  const messages: string[] = [];
  const first = notificationService({ state, messages, changes: [rateChange(9)] });
  const firstResult = await first.run();

  assert.deepEqual(firstResult, { success: 1, skipped: 1, failed: 0, errors: [] });
  assert.equal(messages[0], [
    "【S2A Rate Bot】采集站账户余额",
    "时间：2026/7/21 12:00:00",
    "",
    "总余额：12.5",
    "",
    "站点明细：",
    "- Source（source@example.com）：12.5",
  ].join("\n"));
  assert.equal((await state.get()).lastBalancePushAt, NOW.toISOString());
  assert.equal((await state.get()).lastRateChangeId, 9);

  const second = notificationService({ state, messages, changes: [rateChange(10)] });
  const secondResult = await second.run();
  assert.deepEqual(secondResult, { success: 1, skipped: 1, failed: 0, errors: [] });
  assert.match(messages[1] ?? "", /Source \/ VIP：倍率 2 → 2\.5/);
  assert.equal((await state.get()).lastRateChangeId, 10);
});

test("notifications immediately report failed and partial site refreshes", async () => {
  const state = memoryState({ lastBalancePushAt: NOW.toISOString(), lastRateChangeId: 9 });
  const messages: string[] = [];
  const service = createTelegramNotificationService({
    settings: async () => ({ ...SETTINGS, hourlyBalanceEnabled: false, rateChangeEnabled: false }),
    collection: collection([]),
    state,
    client: { sendMessage: async (message) => { messages.push(message.text); } },
    now: () => NOW,
  });

  const result = await service.run({ refreshIssues: [
    { siteId: 2, siteName: "NewAPI", status: "failed", error: "HTTP 503" },
    { siteId: 3, siteName: "Sub2API", status: "partial", error: "倍率接口请求超时" },
  ] });

  assert.deepEqual(result, { success: 1, skipped: 2, failed: 0, errors: [] });
  assert.equal(messages[0], [
    "【S2A Rate Bot】站点刷新异常",
    "时间：2026/7/21 12:00:00",
    "",
    "异常明细：",
    "- NewAPI（ID: 2，刷新失败）：HTTP 503",
    "- Sub2API（ID: 3，部分失败）：倍率接口请求超时",
  ].join("\n"));
});

test("failed rate change delivery does not advance the cursor", async () => {
  const state = memoryState({ lastBalancePushAt: NOW.toISOString(), lastRateChangeId: 9 });
  const service = createTelegramNotificationService({
    settings: async () => ({ ...SETTINGS, hourlyBalanceEnabled: false }),
    collection: collection([rateChange(10)]),
    state,
    client: { sendMessage: async () => { throw new Error("telegram unavailable"); } },
    now: () => NOW,
  });
  const result = await service.run();
  assert.equal(result.failed, 1);
  assert.match(result.errors.join("\n"), /telegram unavailable/);
  assert.equal((await state.get()).lastRateChangeId, 9);
});

function notificationService(input: Readonly<{ state: TelegramStateStore; messages: string[]; changes: ReturnType<typeof rateChange>[] }>) {
  return createTelegramNotificationService({ settings: async () => SETTINGS,
    collection: collection(input.changes), state: input.state,
    client: { sendMessage: async (message) => { input.messages.push(message.text); } }, now: () => NOW });
}

function collection(changes: ReturnType<typeof rateChange>[]) {
  return {
    list: async () => [sourceSite()],
    changes: async (query?: { afterId?: number; limit?: number }) => changes
      .filter((change) => query?.afterId === undefined || change.id > query.afterId)
      .sort((left, right) => query?.afterId === undefined ? right.id - left.id : left.id - right.id)
      .slice(0, query?.limit),
  };
}

function sourceSite() {
  return { id: 1, name: "Source", siteType: "sub2api" as const, baseUrl: "https://source.example.com",
    websiteUrl: "", authMode: "password" as const, username: "source", newApiUserId: "",
    rechargeRatio: 1, intervalSeconds: 600, useProxy: false, enabled: true,
    accountLabel: "source@example.com", balance: 12.5, todayConsume: 1.25, historyRecharge: 30, lastRunAt: NOW.toISOString(),
    lastSuccessAt: NOW.toISOString(), lastStatus: "success" as const, lastError: null,
    consecutiveFailures: 0, refreshVersion: 1, hasPassword: true, hasAccessToken: false, hasRefreshToken: false };
}

function rateChange(id: number) {
  return { id, runId: id, sourceSiteId: 1, sourceSiteName: "Source", groupId: "vip", groupName: "VIP",
    platform: "openai", changeType: "updated" as const, oldRate: 2, newRate: 2.5, collectedAt: NOW.toISOString() };
}

function memoryState(initial: Partial<TelegramNotificationState> = {}): TelegramStateStore {
  let state: TelegramNotificationState = { lastBalancePushAt: initial.lastBalancePushAt ?? null,
    lastRateChangeId: initial.lastRateChangeId ?? null };
  return { get: () => state,
    markBalancePushed: (timestamp) => { state = { ...state, lastBalancePushAt: timestamp }; },
    markRateChangesPushed: (changeId) => { state = { ...state, lastRateChangeId: changeId }; },
    close: () => undefined };
}
