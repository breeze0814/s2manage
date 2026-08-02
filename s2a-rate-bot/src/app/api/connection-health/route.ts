import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../server/connection-health/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ monitors: await getRuntimeConnectionHealthService().listMonitors() });
  } catch (error) { return connectionHealthError(error); }
}
