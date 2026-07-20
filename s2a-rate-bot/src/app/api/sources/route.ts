import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { readJsonBody } from "../../../server/http/request-body.ts";
import { collectionError } from "../../../server/collection/route-support.ts";
import { getRuntimeCollectionService } from "../../../server/collection/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ sites: await getRuntimeCollectionService().list() });
  } catch (error) {
    return collectionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ site: await getRuntimeCollectionService().create(await readJsonBody(request)) }, { status: 201 });
  } catch (error) {
    return collectionError(error);
  }
}
