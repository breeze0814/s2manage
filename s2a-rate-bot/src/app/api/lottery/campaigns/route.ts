import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ items: await getRuntimeEmbedServices().lottery.list() });
  } catch (error) { return embedErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(await getRuntimeEmbedServices().lottery.create(await readJsonBody(request)));
  } catch (error) { return embedErrorResponse(error); }
}
