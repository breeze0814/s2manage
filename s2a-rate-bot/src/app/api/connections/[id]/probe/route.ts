import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../../../server/connection-health/runtime.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { readonly params: { readonly id: string } }) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(await getRuntimeConnectionHealthService().probe(context.params.id));
  } catch (error) { return connectionHealthError(error); }
}
