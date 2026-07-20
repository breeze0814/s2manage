import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { getRuntimeTargetAccountService } from "../../../../server/target-accounts/runtime.ts";
import { targetAccountError } from "../../../../server/target-accounts/route-support.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json(await getRuntimeTargetAccountService().testAllChannels());
  } catch (error) {
    return targetAccountError(error);
  }
}
