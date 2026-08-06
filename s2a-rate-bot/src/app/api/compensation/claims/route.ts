import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../../server/embeds/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ items: await getRuntimeEmbedServices().compensation.listClaims() });
  } catch (error) { return embedErrorResponse(error); }
}
