import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { readJsonObject, RequestBodyError } from "../../../../server/http/request-body.ts";
import { getRuntimeTelegramNotificationService } from "../../../../server/telegram/runtime.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    await getRuntimeTelegramNotificationService().test(await readJsonObject(request));
    return NextResponse.json({ ok: true, message: "Telegram 测试消息已发送" });
  } catch (error) {
    const invalid = error instanceof RequestBodyError || error instanceof ZodError;
    const status = error instanceof AuthRequiredError ? error.status : invalid ? 400 : 502;
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "Telegram 配置无效"
      : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
