import type { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { collectionError } from "../../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../../server/collection/runtime.ts";
import { createCollectionRefreshStream } from "../../../../server/collection/refresh-stream.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return createCollectionRefreshStream(getRuntimeCollectionService());
  } catch (error) {
    return collectionError(error);
  }
}
