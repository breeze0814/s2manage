import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbedIdentity, embedErrorResponse } from "../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";
import { ticketCreateRequest } from "../../../../server/embeds/ticket-route-support.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "tickets", runtime.sessions);
    return NextResponse.json({ items: await runtime.tickets.listUser(identity) }, noStore());
  } catch (error) { return embedErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const runtime = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "tickets", runtime.sessions);
    const input = await ticketCreateRequest(request);
    return NextResponse.json(await runtime.tickets.createUser(identity, input.values, input.files), noStore());
  } catch (error) { return embedErrorResponse(error); }
}

function noStore() { return { headers: { "cache-control": "no-store" } }; }
