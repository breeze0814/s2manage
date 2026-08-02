import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { connectionError } from "../../../../server/connections/route-support.ts";
import { getRuntimeConnectionService } from "../../../../server/connections/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const query = request.nextUrl.searchParams;
    const connectionId = query.get("connectionId") ?? undefined;
    const limit = Number(query.get("limit") ?? "50");
    const cursorValue = query.get("beforeId");
    const beforeId = cursorValue === null ? undefined : Number(cursorValue);
    return NextResponse.json(await getRuntimeConnectionService().eventPage(connectionId, limit, beforeId));
  } catch (error) {
    return connectionError(error);
  }
}
