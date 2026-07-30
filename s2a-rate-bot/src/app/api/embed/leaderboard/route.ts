import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "leaderboard", runtime.sessions);
    const query = request.nextUrl.searchParams;
    const data = await runtime.leaderboard.get({
      startDate: query.get("start_date") ?? undefined,
      endDate: query.get("end_date") ?? undefined,
    }, identity.sub2apiUserId);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) { return embedErrorResponse(error); }
}
