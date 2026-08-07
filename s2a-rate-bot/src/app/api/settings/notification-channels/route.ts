import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { readJsonObject, RequestBodyError } from "../../../../server/http/request-body.ts";
import { getRuntimeSettingsService } from "../../../../server/settings/runtime.ts";
import { notificationChannelSettingsSchema, type NotificationChannelSettings } from "../../../../server/notifications/types.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(maskChannels(await getRuntimeSettingsService().getNotificationChannels?.() ?? emptyChannels()));
  } catch (error) { return channelError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const service = getRuntimeSettingsService();
    const current = await service.getNotificationChannels?.() ?? emptyChannels();
    const settings = await service.saveNotificationChannels?.(mergeSecrets(notificationChannelSettingsSchema.parse(await readJsonObject(request)), current));
    return NextResponse.json(maskChannels(settings ?? emptyChannels()));
  } catch (error) { return channelError(error); }
}

function mergeSecrets(next: NotificationChannelSettings, current: NotificationChannelSettings): NotificationChannelSettings {
  const find = <T extends { id: string }>(values: readonly T[], id: string) => values.find((item) => item.id === id);
  return {
    ...next,
    dingtalk: next.dingtalk.map((bot) => ({ ...bot, webhook: bot.webhook || find(current.dingtalk, bot.id)?.webhook || "", secret: bot.secret || find(current.dingtalk, bot.id)?.secret || "" })),
    wecom: next.wecom.map((bot) => ({ ...bot, webhook: bot.webhook || find(current.wecom, bot.id)?.webhook || "" })),
    feishu: next.feishu.map((bot) => ({ ...bot, webhook: bot.webhook || find(current.feishu, bot.id)?.webhook || "", secret: bot.secret || find(current.feishu, bot.id)?.secret || "" })),
    qq: next.qq.map((bot) => ({ ...bot, clientSecret: bot.clientSecret || find(current.qq, bot.id)?.clientSecret || "" })),
    telegram: next.telegram.map((bot) => ({ ...bot, botToken: bot.botToken || find(current.telegram, bot.id)?.botToken || "" })),
  };
}

function emptyChannels(): NotificationChannelSettings { return { dingtalk: [], wecom: [], qq: [], feishu: [], telegram: [] }; }

function maskChannels(settings: NotificationChannelSettings) {
  return {
    dingtalk: settings.dingtalk.map((bot) => ({ ...bot, webhook: "", secret: "", hasWebhook: Boolean(bot.webhook), hasSecret: Boolean(bot.secret) })),
    wecom: settings.wecom.map((bot) => ({ ...bot, webhook: "", hasWebhook: Boolean(bot.webhook) })),
    qq: settings.qq.map((bot) => ({ ...bot, clientSecret: "", hasClientSecret: Boolean(bot.clientSecret) })),
    feishu: settings.feishu.map((bot) => ({ ...bot, webhook: "", secret: "", hasWebhook: Boolean(bot.webhook), hasSecret: Boolean(bot.secret) })),
    telegram: settings.telegram.map((bot) => ({ ...bot, botToken: "", hasBotToken: Boolean(bot.botToken) })),
  };
}

function channelError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof RequestBodyError || error instanceof ZodError ? 400 : 500;
  const message = error instanceof ZodError ? error.issues[0]?.message ?? "通知机器人配置无效" : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}
