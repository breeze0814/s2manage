import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";
import { RequestBodyError } from "../http/request-body.ts";

export function targetAccountError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof RequestBodyError || error instanceof ZodError ? 400 : 500;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "账号参数无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}
