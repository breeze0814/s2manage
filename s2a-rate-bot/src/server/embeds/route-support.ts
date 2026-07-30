import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";
import { RequestBodyError } from "../http/request-body.ts";
import type { EmbedSessionService } from "./session.ts";
import { EmbedError, type EmbedKind } from "./types.ts";

export async function requireEmbedIdentity(
  request: NextRequest,
  kind: EmbedKind,
  sessions: EmbedSessionService,
) {
  const identity = await sessions.verify(bearerToken(request), kind);
  if (!identity) throw new EmbedError("嵌入会话无效或已过期", 401);
  return identity;
}

export function embedErrorResponse(error: unknown) {
  const status = error instanceof EmbedError
    ? error.status
    : error instanceof AuthRequiredError
      ? error.status
      : error instanceof ZodError || error instanceof RequestBodyError ? 400 : 500;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "输入无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : "";
}
