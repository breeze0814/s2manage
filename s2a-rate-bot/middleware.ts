import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createJwtSessionService, SESSION_COOKIE_NAME } from "./src/server/auth/session.ts";

const AUTH_API_PREFIX = "/api/auth/";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(AUTH_API_PREFIX)) return NextResponse.next();
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const identity = await createJwtSessionService(secret).verify(token);
  if (identity) return NextResponse.next();
  return NextResponse.json({ error: "未登录或登录已失效" }, { status: 401 });
}

export const config = {
  matcher: ["/api/((?!auth/).*)"],
};
