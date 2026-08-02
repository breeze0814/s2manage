import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../../../server/connection-health/runtime.ts";
import { readJsonObject } from "../../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { readonly params: { readonly id: string } }) {
  try {
    await requireAuthenticatedRequest(request);
    const body = await readJsonObject(request);
    const monitor = await getRuntimeConnectionHealthService().assign(context.params.id, body.policyId ?? null);
    return NextResponse.json({ monitor });
  } catch (error) { return connectionHealthError(error); }
}
