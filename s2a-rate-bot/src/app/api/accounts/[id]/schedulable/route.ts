import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { readJsonBody } from "../../../../../server/http/request-body.ts";
import { getRuntimeTargetAccountService } from "../../../../../server/target-accounts/runtime.ts";
import { targetAccountError } from "../../../../../server/target-accounts/route-support.ts";

export const runtime = "nodejs";
const bodySchema = z.object({ schedulable: z.boolean() });

export async function PUT(request: NextRequest, context: { readonly params: { readonly id: string } }) {
  try {
    await requireAuthenticatedRequest(request);
    const accountId = z.coerce.number().int().positive().parse(context.params.id);
    const body = bodySchema.parse(await readJsonBody(request));
    const account = await getRuntimeTargetAccountService().setSchedulable(accountId, body.schedulable);
    return NextResponse.json({ account });
  } catch (error) {
    return targetAccountError(error);
  }
}
