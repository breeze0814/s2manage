import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { embedErrorResponse } from "../../../server/embeds/route-support.ts";
import { getRuntimeEmbedServices } from "../../../server/embeds/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const status = request.nextUrl.searchParams.get("status") || undefined;
    return NextResponse.json({ items: getRuntimeEmbedServices().tickets.listAdmin(status) });
  } catch (error) { return embedErrorResponse(error); }
}
