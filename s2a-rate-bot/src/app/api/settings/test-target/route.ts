import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { getRuntimeTargetGroupService } from "../../../../server/target-groups/runtime.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const groups = await getRuntimeTargetGroupService().refreshAll();
    return NextResponse.json({ ok: true, count: groups.length, message: `连接成功，已同步 ${groups.length} 个分组到本地` });
  } catch (error) {
    const status = error instanceof AuthRequiredError ? error.status : 502;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
