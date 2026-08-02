import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../server/auth/route-support.ts";
import { connectionError } from "../../../../server/connections/route-support.ts";
import { getRuntimeConnectionService } from "../../../../server/connections/runtime.ts";
import { readJsonBody } from "../../../../server/http/request-body.ts";

export const runtime = "nodejs";
type Context = { readonly params: { readonly id: string } };

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    return NextResponse.json({ connection: await getRuntimeConnectionService().get(context.params.id) });
  } catch (error) { return connectionError(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await requireAuthenticatedRequest(request);
    const connection = await getRuntimeConnectionService().disconnect(context.params.id, await readJsonBody(request));
    return NextResponse.json({ connection });
  } catch (error) { return connectionError(error); }
}
