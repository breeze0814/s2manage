import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createJsonHttpClient } from "../../../../adapters/http-client.ts";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { getRuntimeSettingsService } from "../../../../server/settings/runtime.ts";
import { testTargetConnection } from "../../../../server/settings/target-test.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const settings = await getRuntimeSettingsService().get();
    if (!settings.target) throw new Error("请先保存目标站配置");
    const http = createJsonHttpClient({
      timeoutMs: settings.worker.timeoutSeconds * 1_000,
      proxyUrl: settings.proxy.enabled ? settings.proxy.proxyUrl : null,
    });
    return NextResponse.json(await testTargetConnection({ target: settings.target, http }));
  } catch (error) {
    const status = error instanceof AuthRequiredError ? error.status : 502;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
