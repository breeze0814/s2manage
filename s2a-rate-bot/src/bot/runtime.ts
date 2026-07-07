import { Sub2ApiAdminTarget } from "../adapters/sub2api-admin.ts";
import type { AppStorage, AppStorageFactory, BotSettings, TargetSettings } from "../storage/app-config.ts";
import { createSqliteAppStorage } from "../storage/sqlite-app-storage.ts";
import { readRuntimeConfig } from "../shared/config.ts";
import { handleIncomingBotMessage } from "./handler.ts";
import { runInviteActivityStatsCycle } from "./scheduler.ts";

type NapLinkClient = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  getLoginInfo: () => Promise<Record<string, unknown>>;
  getStatus: () => Promise<unknown>;
  sendGroupMessage: (groupId: string, message: string) => Promise<unknown>;
  sendPrivateMessage: (userId: string, message: string) => Promise<unknown>;
};

type NapLinkConstructor = new (input: Record<string, unknown>) => NapLinkClient;

const DEFAULT_RETRY_SECONDS = 60;
const DEFAULT_STATS_INTERVAL_SECONDS = 3600;

export async function runBot(storageFactory: AppStorageFactory = createSqliteAppStorage) {
  const config = readRuntimeConfig();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required before the QQBot listener can run");
  const storage = storageFactory(config.databaseUrl);
  const stop = createStopSignal();
  try {
    while (!stop.stopping) {
      const appConfig = await storage.getAppConfig();
      const validation = validateBotConfig(appConfig.bot, appConfig.target);
      if (validation) {
        console.log(`[bot] ${validation}; retry in ${DEFAULT_RETRY_SECONDS}s`);
        await storage.recordRuntimeEvent({
          service: "bot",
          eventType: "config",
          status: "failed",
          message: validation,
        });
        await stop.delay(DEFAULT_RETRY_SECONDS * 1000);
        continue;
      }
      try {
        await runConnectedBot({
          storage,
          settings: appConfig.bot,
          target: appConfig.target!,
          stop,
        });
      } catch (error) {
        console.error(`[bot] ${errorMessage(error)}; retry in ${DEFAULT_RETRY_SECONDS}s`);
        await stop.delay(DEFAULT_RETRY_SECONDS * 1000);
      }
    }
  } finally {
    storage.close();
  }
}

async function runConnectedBot(input: {
  readonly storage: AppStorage;
  readonly settings: BotSettings;
  readonly target: TargetSettings;
  readonly stop: ReturnType<typeof createStopSignal>;
}) {
  const client = await createNapLinkClient(input.settings);
  const messenger = {
    sendGroupMessage: (groupId: string, message: string) => client.sendGroupMessage(groupId, message).then(() => undefined),
    sendPrivateMessage: (userId: string, message: string) => client.sendPrivateMessage(userId, message).then(() => undefined),
  };

  client.on("message", (data) => {
    void (async () => {
      const appConfig = await input.storage.getAppConfig();
      if (!appConfig.target) return;
      const targetClient = new Sub2ApiAdminTarget(appConfig.target.baseUrl, appConfig.target.adminApiKey);
      await handleIncomingBotMessage({
        now: new Date(),
        settings: appConfig.bot,
        target: appConfig.target,
        targetGroups: appConfig.targetGroups,
        storage: input.storage,
        client: targetClient,
        messenger,
        data,
      });
    })().catch((error) => console.error(`[bot] handle message failed: ${errorMessage(error)}`));
  });

  try {
    console.log("[bot] connecting NapCat WebSocket");
    await client.connect();
    console.log(`[bot] NapCat status: ${JSON.stringify(await client.getStatus()).slice(0, 300)}`);
    await input.storage.recordRuntimeEvent({
      service: "bot",
      eventType: "napcat-connected",
      status: "success",
      message: "NapCat WebSocket connected",
    });
    await refreshLoginInfo(input.storage, input.settings, client);
    await runStatsLoop({
      storage: input.storage,
      messenger,
      stop: input.stop,
    });
  } finally {
    client.disconnect();
  }
}

async function runStatsLoop(input: {
  readonly storage: AppStorage;
  readonly messenger: { readonly sendPrivateMessage: (userId: string, message: string) => Promise<void> };
  readonly stop: ReturnType<typeof createStopSignal>;
}) {
  const intervalMs = statsIntervalSeconds() * 1000;
  while (!input.stop.stopping) {
    try {
      const appConfig = await input.storage.getAppConfig();
      if (appConfig.bot.enabled && appConfig.bot.scheduledStatsEnabled && appConfig.bot.activePrivateMessageEnabled && appConfig.target) {
        const targetClient = new Sub2ApiAdminTarget(appConfig.target.baseUrl, appConfig.target.adminApiKey);
        const result = await runInviteActivityStatsCycle({
          now: new Date(),
          target: appConfig.target,
          bot: appConfig.bot,
          storage: input.storage,
          client: targetClient,
          messenger: input.messenger,
        });
        console.log([
          "[bot] invite activity stats cycle completed",
          `invitees=${result.summary.periodInviteeCount}`,
          `issued=${result.issued}`,
          `failed=${result.failed}`,
          `skipped=${result.skipped}`,
        ].join(", "));
        await input.storage.recordRuntimeEvent({
          service: "bot",
          eventType: "invite-stats-cycle",
          status: result.failed > 0 ? "failed" : "success",
          message: `invitees=${result.summary.periodInviteeCount}, issued=${result.issued}, failed=${result.failed}, skipped=${result.skipped}`,
          metadata: {
            period: result.summary.period,
            invitees: result.summary.periodInviteeCount,
            issued: result.issued,
            failed: result.failed,
            skipped: result.skipped,
          },
        });
      }
    } catch (error) {
      console.error(`[bot] invite activity stats cycle failed: ${errorMessage(error)}`);
      await input.storage.recordRuntimeEvent({
        service: "bot",
        eventType: "invite-stats-cycle",
        status: "failed",
        message: errorMessage(error),
      });
    }
    await input.stop.delay(intervalMs);
  }
}

async function createNapLinkClient(settings: BotSettings) {
  process.env.WS_NO_BUFFER_UTIL = "1";
  process.env.WS_NO_UTF_8_VALIDATE = "1";
  const { NapLink } = await import("@naplink/naplink") as unknown as { NapLink: NapLinkConstructor };
  return new NapLink({
    connection: {
      url: settings.wsUrl.trim(),
      token: settings.token.trim() || undefined,
      timeout: 10_000,
      pingInterval: 0,
    },
    reconnect: {
      enabled: true,
      maxAttempts: Number.MAX_SAFE_INTEGER,
      backoff: { initial: 60_000, max: 60_000, multiplier: 1 },
    },
    logging: { level: "off" },
    api: { timeout: 10_000, retries: 0 },
  });
}

async function refreshLoginInfo(storage: AppStorage, settings: BotSettings, client: NapLinkClient) {
  try {
    const info = await client.getLoginInfo();
    const botUserId = info.user_id === undefined || info.user_id === null ? settings.botUserId : String(info.user_id);
    if (!botUserId || botUserId === settings.botUserId) return;
    await storage.saveBotSettings({ ...settings, botUserId });
    console.log(`[bot] current Bot QQ: ${botUserId}`);
  } catch (error) {
    console.error(`[bot] getLoginInfo failed: ${errorMessage(error)}`);
  }
}

function validateBotConfig(settings: BotSettings, target: TargetSettings | null) {
  if (!settings.enabled) return "QQBot is disabled";
  if (!settings.wsUrl.trim()) return "NapCat WebSocket URL is empty";
  if (!settings.targetGroupId.trim()) return "target QQ group is empty";
  if (!target) return "target Sub2API is not configured";
  return null;
}

function statsIntervalSeconds() {
  const value = Number(process.env.S2A_BOT_STATS_INTERVAL_SECONDS);
  return Number.isInteger(value) && value >= 60 ? value : DEFAULT_STATS_INTERVAL_SECONDS;
}

function createStopSignal() {
  let wakeDelay: (() => void) | null = null;
  const state = {
    stopping: false,
    delay(ms: number) {
      return new Promise<void>((resolve) => {
        if (state.stopping) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          wakeDelay = null;
          resolve();
        }, ms);
        wakeDelay = () => {
          clearTimeout(timer);
          wakeDelay = null;
          resolve();
        };
      });
    },
  };
  const requestStop = () => {
    state.stopping = true;
    wakeDelay?.();
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  return state;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
