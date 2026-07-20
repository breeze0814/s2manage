import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";
import { collectionError, sourceId } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";

export const runtime = "nodejs";
type RouteContext = { readonly params: { readonly id: string } };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    await requireAuthenticatedRequest(request);
    const site = await getRuntimeCollectionService().update(sourceId(context.params.id), await readJsonBody(request));
    return NextResponse.json({ site });
  } catch (error) {
    return collectionError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAuthenticatedRequest(request);
    await getRuntimeCollectionService().delete(sourceId(context.params.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return collectionError(error);
  }
}
