import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { readJsonObject, RequestBodyError } from "../../../../../server/http/request-body.ts";
import { getRuntimeNotificationDispatcher } from "../../../../../server/notifications/runtime.ts";
import { getRuntimeSettingsService } from "../../../../../server/settings/runtime.ts";
import { notificationChannelSchema, type NotificationChannelSettings, type NotificationChannelSettingsInput } from "../../../../../server/notifications/types.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const body = await readJsonObject(request);
    const service = getRuntimeSettingsService();
    const current = await service.getNotificationChannels?.() ?? { dingtalk: [], wecom: [], qq: [], feishu: [], telegram: [] };
    const channel = mergeTestSecrets(body, current);
    await getRuntimeNotificationDispatcher().test(channel);
    return NextResponse.json({ ok: true, message: "机器人测试消息已发送" });
  } catch (error) {
    const invalid = error instanceof RequestBodyError || error instanceof ZodError;
    const status = error instanceof AuthRequiredError ? error.status : invalid ? 400 : 502;
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "机器人配置无效" : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}

function mergeTestSecrets(body: Record<string, unknown>, current: NotificationChannelSettings): NotificationChannelSettingsInput {
  const channel = notificationChannelSchema.parse(body.channel);
  const id = typeof body.id === "string" ? body.id : "";
  const list = current[channel as keyof NotificationChannelSettings] ?? [];
  const stored = (list as readonly { id: string }[]).find((bot) => bot.id === id) as Record<string, unknown> | undefined;
  const merged = { ...stored, ...body };
  if (stored) {
    for (const key of ["webhook", "secret", "botToken", "clientSecret"]) {
      if (!merged[key] && stored[key]) merged[key] = stored[key];
    }
  }
  return merged as NotificationChannelSettingsInput;
}
