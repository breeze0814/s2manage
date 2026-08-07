import { createNotificationDispatcher, type NotificationDispatcher } from "./dispatcher.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";

const globalNotifications = globalThis as typeof globalThis & { s2aNotificationDispatcher?: NotificationDispatcher };

export function getRuntimeNotificationDispatcher(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalNotifications.s2aNotificationDispatcher) return globalNotifications.s2aNotificationDispatcher;
  const settings = getRuntimeSettingsService(env);
  const dispatcher = createNotificationDispatcher({
    settings: async () => settings.getNotificationChannels?.() ?? { dingtalk: [], wecom: [], qq: [], feishu: [], telegram: [] },
    timeoutMs: async () => (await settings.get()).worker.timeoutSeconds * 1_000,
    proxyUrl: async () => { const proxy = (await settings.get()).proxy; return proxy.enabled ? proxy.proxyUrl : null; },
  });
  if (env === process.env) globalNotifications.s2aNotificationDispatcher = dispatcher;
  return dispatcher;
}
