import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "lottery", runtime.sessions);
    return NextResponse.json({ items: await runtime.lottery.list(identity) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return embedErrorResponse(error); }
}
