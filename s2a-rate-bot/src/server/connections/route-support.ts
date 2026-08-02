import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";
import { RequestBodyError } from "../http/request-body.ts";
import { ConnectionConflictError } from "./service.ts";

export function connectionError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status
    : error instanceof RequestBodyError || error instanceof ZodError ? 400
      : error instanceof ConnectionConflictError ? 409
        : isMissing(error) ? 404 : 502;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "真实连接参数无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

function isMissing(error: unknown) {
  return error instanceof Error && error.message.includes("不存在");
}
