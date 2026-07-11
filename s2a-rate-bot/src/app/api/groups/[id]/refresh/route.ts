import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { getRuntimeTargetGroupService } from "../../../../../server/target-groups/runtime.ts";
import { targetGroupError, targetGroupId } from "../../../../../server/target-groups/route-support.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { readonly params: { readonly id: string } }) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ group: await getRuntimeTargetGroupService().refresh(targetGroupId(context.params.id)) });
  } catch (error) {
    return targetGroupError(error);
  }
}
