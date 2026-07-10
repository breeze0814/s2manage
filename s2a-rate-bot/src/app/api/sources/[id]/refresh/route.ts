import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { collectionError, sourceId } from "../../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../../server/collection/runtime.ts";

export const runtime = "nodejs";
type RouteContext = { readonly params: { readonly id: string } };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireAuthenticatedRequest(request);
    const site = await getRuntimeCollectionService().refresh(sourceId(context.params.id));
    return NextResponse.json({ site });
  } catch (error) {
    return collectionError(error);
  }
}
