import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";
import { embedErrorResponse, requireEmbedIdentity } from "../../../../server/embeds/route-support.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const runtimeServices = getRuntimeEmbedServices();
    const identity = await requireEmbedIdentity(request, "compensation", runtimeServices.sessions);
    const claim = await runtimeServices.compensation.calculate(identity, await readJsonBody(request));
    return NextResponse.json(claim);
  } catch (error) { return embedErrorResponse(error); }
}
