import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { collectionError, sourceId } from "../../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../../server/collection/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { readonly params: { readonly id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuthenticatedRequest(request);
    const monitors = await getRuntimeCollectionService().channelMonitors(sourceId(context.params.id));
    return NextResponse.json({ monitors }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return collectionError(error);
  }
}
