import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../server/embeds/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const query = request.nextUrl.searchParams;
    const data = await getRuntimeEmbedServices().leaderboard.get({ startDate: query.get("start_date") ?? undefined, endDate: query.get("end_date") ?? undefined });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) { return embedErrorResponse(error); }
}
