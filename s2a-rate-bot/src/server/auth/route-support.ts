import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRuntimeAuthService } from "./runtime.ts";
import { authCredentialsSchema } from "./service.ts";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./session.ts";
import { readJsonBody, RequestBodyError } from "../http/request-body.ts";

export async function credentialsFromRequest(request: Request) {
  return authCredentialsSchema.parse(await readJsonBody(request));
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
  return NextResponse.json({ error: message }, { status: error instanceof RequestBodyError || error instanceof ZodError ? 400 : status });
}

export function runtimeAuth() {
  return getRuntimeAuthService();
}

export async function requireAuthenticatedRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const status = await runtimeAuth().status(token);
  if (!status.authenticated) throw new AuthRequiredError();
  return status;
}

export class AuthRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("未登录或登录已失效");
  }
}
