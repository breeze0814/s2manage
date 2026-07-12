import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";

export const runtime = "nodejs";
const CHANGE_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ changes: await getRuntimeCollectionService().changes(CHANGE_LIMIT) });
  } catch (error) {
    return collectionError(error);
  }
}
