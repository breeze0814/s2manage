import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { readJsonObject, RequestBodyError } from "../../../server/http/request-body.ts";
import { getRuntimeSettingsService } from "../../../server/settings/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(maskSettings(await getRuntimeSettingsService().get()));
  } catch (error) {
    return settingsError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const service = getRuntimeSettingsService();
    const current = await service.get();
    const body = await readJsonObject(request);
    const saved = await service.save(mergeStoredSecrets(body, {
      adminApiKey: current.target?.adminApiKey,
      telegramBotToken: current.telegram.botToken,
    }));
    return NextResponse.json(maskSettings(saved));
  } catch (error) {
    return settingsError(error);
  }
}

function mergeStoredSecrets(body: Record<string, unknown>, current: Readonly<{ adminApiKey?: string; telegramBotToken: string }>) {
  const target = body.target && typeof body.target === "object" ? body.target as Record<string, unknown> : {};
  const provided = typeof target.adminApiKey === "string" ? target.adminApiKey.trim() : "";
  const telegram = body.telegram && typeof body.telegram === "object" ? body.telegram as Record<string, unknown> : {};
  const botToken = typeof telegram.botToken === "string" ? telegram.botToken.trim() : "";
  return {
    ...body,
    target: { ...target, adminApiKey: provided || current.adminApiKey || "" },
    telegram: { ...telegram, botToken: botToken || current.telegramBotToken },
  };
}

function maskSettings<T extends { target: { adminApiKey: string } | null; telegram: { botToken: string } }>(settings: T) {
  const target = settings.target ? { ...settings.target, adminApiKey: "" } : null;
  return {
    ...settings,
    target,
    telegram: { ...settings.telegram, botToken: "" },
    hasAdminApiKey: Boolean(settings.target?.adminApiKey),
    hasTelegramBotToken: Boolean(settings.telegram.botToken),
  };
}

function settingsError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof RequestBodyError || error instanceof ZodError ? 400 : 500;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "配置无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}
