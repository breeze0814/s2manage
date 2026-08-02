import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";
import type { CollectionRateChangeType } from "../../../../server/collection/types.ts";

export const runtime = "nodejs";
const CHANGE_LIMIT = 50;
const CHANGE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const params = request.nextUrl.searchParams;
    const siteId = optionalInteger(params.get("siteId"), "采集站 ID");
    const groupId = optionalText(params.get("groupId"));
    const changeType = optionalChangeType(params.get("changeType"));
    const since = params.get("all") === "true" || siteId !== undefined || groupId ? undefined : params.get("since") ?? recentSince();
    if (!hasAdvancedQuery(params)) {
      return NextResponse.json({ changes: await getRuntimeCollectionService().changes({ limit: CHANGE_LIMIT, since }) });
    }
    return NextResponse.json({
      changes: await getRuntimeCollectionService().changes({
        limit: optionalInteger(params.get("limit"), "数量") ?? CHANGE_LIMIT,
        since,
        afterId: optionalInteger(params.get("afterId"), "游标"),
        siteId,
        groupId,
        changeType,
      }),
    });
  } catch (error) {
    return collectionError(error);
  }
}

function hasAdvancedQuery(params: URLSearchParams) {
  return params.has("all") || params.has("siteId") || params.has("groupId") || params.has("changeType") || params.has("limit") || params.has("afterId") || params.has("since");
}

function recentSince() { return new Date(Date.now() - CHANGE_WINDOW_MS).toISOString(); }

function optionalInteger(value: string | null, label: string) {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label}无效`);
  return parsed;
}

function optionalText(value: string | null) {
  const text = value?.trim() ?? "";
  return text || undefined;
}

function optionalChangeType(value: string | null): CollectionRateChangeType | undefined {
  if (value === null || value === "") return undefined;
  if (value !== "added" && value !== "updated" && value !== "deleted") throw new Error("倍率变更类型无效");
  return value;
}
