import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRuntimeAuthService } from "./runtime.ts";
import { authCredentialsSchema } from "./service.ts";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./session.ts";

export async function credentialsFromRequest(request: Request) {
  return authCredentialsSchema.parse(await request.json());
}

export function authenticatedResponse(token: string) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(process.env.NODE_ENV === "production"));
  return response;
}

export function clearedSessionResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(false), maxAge: 0 });
  return response;
}

export function authErrorResponse(error: unknown, status: number) {
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "输入无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export function runtimeAuth() {
  return getRuntimeAuthService();
}
