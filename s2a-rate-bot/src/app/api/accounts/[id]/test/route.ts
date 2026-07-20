import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { getRuntimeTargetAccountService } from "../../../../../server/target-accounts/runtime.ts";
import { targetAccountError } from "../../../../../server/target-accounts/route-support.ts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { readonly params: { readonly id: string } }) {
  try {
    await requireAuthenticatedRequest(request);
    const accountId = z.coerce.number().int().positive().parse(context.params.id);
    return NextResponse.json(await getRuntimeTargetAccountService().testChannel(accountId));
  } catch (error) {
    return targetAccountError(error);
  }
}
