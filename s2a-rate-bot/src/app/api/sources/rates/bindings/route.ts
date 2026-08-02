import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { readJsonBody } from "../../../../../server/http/request-body.ts";
import { getRuntimeTargetGroupService } from "../../../../../server/target-groups/runtime.ts";
import { targetGroupError } from "../../../../../server/target-groups/route-support.ts";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const groups = await getRuntimeTargetGroupService().saveSourceBindings(await readJsonBody(request));
    return NextResponse.json({ groups });
  } catch (error) {
    return targetGroupError(error);
  }
}
