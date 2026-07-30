import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(getRuntimeEmbedServices().tickets.getAdmin(params.id));
  } catch (error) { return embedErrorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(getRuntimeEmbedServices().tickets.updateStatus(params.id, await readJsonBody(request)));
  } catch (error) { return embedErrorResponse(error); }
}

type Context = Readonly<{ params: Readonly<{ id: string }> }>;
