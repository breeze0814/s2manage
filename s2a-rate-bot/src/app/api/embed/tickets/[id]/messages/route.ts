import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../../../server/embeds/runtime.ts";
import { readJsonBody } from "../../../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "tickets", runtime.sessions);
    const ticket = runtime.tickets.replyUser(params.id, identity, await readJsonBody(request));
    return NextResponse.json(ticket, { headers: { "cache-control": "no-store" } });
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
