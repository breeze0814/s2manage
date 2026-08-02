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
    const sourceSiteId = Number(query.get("sourceSiteId"));
    const targetGroupIds = (query.get("targetGroupIds") ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    return NextResponse.json(await getRuntimeConnectionService().resourceOptions({
      sourceSiteId,
      targetGroupIds,
    }));
  } catch (error) {
    return connectionError(error);
  }
}
