import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../server/auth/route-support.ts";
import { targetGroupError } from "../../../server/target-groups/route-support.ts";
import { getRuntimeTargetGroupService } from "../../../server/target-groups/runtime.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ groups: await getRuntimeTargetGroupService().list() });
  } catch (error) {
    return targetGroupError(error);
  }
}
