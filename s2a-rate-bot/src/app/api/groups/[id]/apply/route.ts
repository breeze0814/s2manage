import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { targetGroupError, targetGroupId } from "../../../../../server/target-groups/route-support.ts";
import { getRuntimeTargetGroupService } from "../../../../../server/target-groups/runtime.ts";

export const runtime = "nodejs";
type Context = { readonly params: { readonly id: string } };

export async function POST(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ decision: await getRuntimeTargetGroupService().apply(targetGroupId(context.params.id)) });
  } catch (error) {
    return targetGroupError(error);
  }
}
