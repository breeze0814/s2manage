import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const rawSiteId = request.nextUrl.searchParams.get("siteId");
    const siteId = rawSiteId ? Number(rawSiteId) : undefined;
    if (siteId !== undefined && (!Number.isInteger(siteId) || siteId <= 0)) throw new Error("采集站 ID 无效");
    return NextResponse.json({ rates: await getRuntimeCollectionService().rates(siteId) });
  } catch (error) {
    return collectionError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const body = await request.json() as { siteId?: unknown; groupId?: unknown; platform?: unknown };
    const siteId = Number(body.siteId);
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!Number.isInteger(siteId) || siteId <= 0) throw new Error("采集站 ID 无效");
    if (!groupId) throw new Error("采集分组 ID 无效");
    const rate = await getRuntimeCollectionService().setRatePlatform(siteId, groupId, body.platform ?? null);
    return NextResponse.json({ rate });
  } catch (error) {
    return collectionError(error);
  }
}
