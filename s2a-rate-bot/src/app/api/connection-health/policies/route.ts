import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../../server/connection-health/runtime.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ policies: await getRuntimeConnectionHealthService().listPolicies() });
  } catch (error) { return connectionHealthError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const policy = await getRuntimeConnectionHealthService().createPolicy(await readJsonBody(request));
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) { return connectionHealthError(error); }
}
