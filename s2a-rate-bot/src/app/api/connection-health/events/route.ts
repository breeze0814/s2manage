import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../../server/connection-health/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const connectionId = request.nextUrl.searchParams.get("connectionId") ?? undefined;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const cursorValue = request.nextUrl.searchParams.get("beforeId");
    const beforeId = cursorValue === null ? undefined : Number(cursorValue);
    return NextResponse.json(await getRuntimeConnectionHealthService().eventPage(connectionId, limit, beforeId));
  } catch (error) { return connectionHealthError(error); }
}
