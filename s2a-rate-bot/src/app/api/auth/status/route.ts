import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runtimeAuth } from "../../../../server/auth/route-support.ts";
import { SESSION_COOKIE_NAME } from "../../../../server/auth/session.ts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return NextResponse.json(await runtimeAuth().status(token));
}
