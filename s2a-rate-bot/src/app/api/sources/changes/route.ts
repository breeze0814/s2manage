import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";

export const runtime = "nodejs";
const CHANGE_LIMIT = 50;
const CHANGE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const since = new Date(Date.now() - CHANGE_WINDOW_MS).toISOString();
    return NextResponse.json({
      changes: await getRuntimeCollectionService().changes({ limit: CHANGE_LIMIT, since }),
    });
  } catch (error) {
    return collectionError(error);
  }
}
