import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../../server/auth/route-support.ts";
import { connectionHealthError } from "../../../../../server/connection-health/route-support.ts";
import { getRuntimeConnectionHealthService } from "../../../../../server/connection-health/runtime.ts";
import { readJsonBody } from "../../../../../server/http/request-body.ts";

export const runtime = "nodejs";
type Context = { readonly params: { readonly id: string } };

export async function PUT(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const policy = await getRuntimeConnectionHealthService().updatePolicy(Number(context.params.id), await readJsonBody(request));
    return NextResponse.json({ policy });
  } catch (error) { return connectionHealthError(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    await getRuntimeConnectionHealthService().deletePolicy(Number(context.params.id));
    return new NextResponse(null, { status: 204 });
  } catch (error) { return connectionHealthError(error); }
}
