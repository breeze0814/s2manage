import { createTelegramBotClient } from "../../adapters/telegram-bot.ts";
import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { createTelegramNotificationService, type TelegramNotificationService } from "./service.ts";
import { createSqliteTelegramStateStore } from "./state-store.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
const globalTelegram = globalThis as typeof globalThis & { s2aTelegramService?: TelegramNotificationService };

export function getRuntimeTelegramNotificationService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalTelegram.s2aTelegramService) return globalTelegram.s2aTelegramService;
  const settings = getRuntimeSettingsService(env);
  const service = createTelegramNotificationService({
    settings: async () => runtimeSettings(await settings.get()),
    collection: getRuntimeCollectionService(env),
    state: createSqliteTelegramStateStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    client: createTelegramBotClient(),
    now: () => new Date(),
  });
  if (env === process.env) globalTelegram.s2aTelegramService = service;
  return service;
}

function runtimeSettings(settings: Awaited<ReturnType<ReturnType<typeof getRuntimeSettingsService>["get"]>>) {
  return {
    ...settings.telegram,
    timeoutMs: settings.worker.timeoutSeconds * 1_000,
    proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
  };
}
