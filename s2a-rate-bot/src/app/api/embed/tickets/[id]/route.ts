import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "tickets", runtime.sessions);
    return NextResponse.json(await runtime.tickets.getUser(params.id, identity), { headers: { "cache-control": "no-store" } });
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
