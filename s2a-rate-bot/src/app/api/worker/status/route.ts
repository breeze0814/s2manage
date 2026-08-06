import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { getRuntimeWorkerService } from "../../../../server/worker/runtime.ts";
import { workerConnectionStatus } from "../../../../server/worker/heartbeat.ts";
import { getRuntimeInfrastructure } from "../../../../server/infrastructure/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const [run, connection, infrastructure] = await Promise.all([
      getRuntimeWorkerService().latest(), workerConnectionStatus(), getRuntimeInfrastructure().status(),
    ]);
    return NextResponse.json({ run, connection, infrastructure });
  } catch (error) {
    const status = error instanceof AuthRequiredError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
