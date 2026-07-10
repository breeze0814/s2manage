import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { targetGroupError, targetGroupId } from "../../../../../server/target-groups/route-support.ts";
import { getRuntimeTargetGroupService } from "../../../../../server/target-groups/runtime.ts";

export const runtime = "nodejs";
type Context = { readonly params: { readonly id: string } };

export async function PUT(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const group = await getRuntimeTargetGroupService().saveRule(targetGroupId(context.params.id), await request.json());
    return NextResponse.json({ group });
  } catch (error) {
    return targetGroupError(error);
  }
}
