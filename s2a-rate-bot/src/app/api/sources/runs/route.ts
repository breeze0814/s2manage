import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError, sourceId } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";
import type { CollectionRunStatus } from "../../../../server/collection/history.ts";

export const runtime = "nodejs";
const DEFAULT_RUN_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const params = request.nextUrl.searchParams;
    return NextResponse.json({ runs: await getRuntimeCollectionService().runs({
      limit: parseInteger(params.get("limit"), DEFAULT_RUN_LIMIT, "数量"),
      since: optionalText(params.get("since")),
      siteId: optionalSiteId(params.get("siteId")),
      status: parseStatus(params.get("status")),
    }) });
  } catch (error) {
    return collectionError(error);
  }
}

function parseInteger(value: string | null, defaultValue: number, label: string) {
  if (value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label}无效`);
  return parsed;
}

function optionalSiteId(value: string | null) {
  if (value === null || value === "") return undefined;
  return sourceId(value);
}

function optionalText(value: string | null) {
  const text = value?.trim() ?? "";
  return text || undefined;
}

function parseStatus(value: string | null): CollectionRunStatus | undefined {
  if (value === null || value === "") return undefined;
  if (value !== "success" && value !== "failed") throw new Error("采集运行状态无效");
  return value;
}
