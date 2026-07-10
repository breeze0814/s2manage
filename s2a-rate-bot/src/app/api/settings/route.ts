import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
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
    const body = await request.json() as Record<string, unknown>;
    const saved = await service.save(mergeAdminKey(body, current.target?.adminApiKey));
    return NextResponse.json(maskSettings(saved));
  } catch (error) {
    return settingsError(error);
  }
}

function mergeAdminKey(body: Record<string, unknown>, currentKey?: string) {
  const target = body.target && typeof body.target === "object" ? body.target as Record<string, unknown> : {};
  const provided = typeof target.adminApiKey === "string" ? target.adminApiKey.trim() : "";
  return { ...body, target: { ...target, adminApiKey: provided || currentKey || "" } };
}

function maskSettings<T extends { target: { adminApiKey: string } | null }>(settings: T) {
  if (!settings.target) return { ...settings, hasAdminApiKey: false };
  return { ...settings, target: { ...settings.target, adminApiKey: "" }, hasAdminApiKey: true };
}

function settingsError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof ZodError ? 400 : 500;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "配置无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}
