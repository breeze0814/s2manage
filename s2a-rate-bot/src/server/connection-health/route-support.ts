import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";
import { RequestBodyError } from "../http/request-body.ts";
import { HealthPolicyConflictError, HealthProbeError } from "./service.ts";

export function connectionHealthError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status
    : error instanceof RequestBodyError || error instanceof ZodError ? 400
      : error instanceof HealthPolicyConflictError ? 409
        : missing(error) ? 404 : 502;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "连接健康参数无效"
    : error instanceof Error ? error.message : String(error);
  const detail = error instanceof HealthProbeError ? { execution: error.execution } : {};
  return NextResponse.json({ error: message, ...detail }, { status });
}

function missing(error: unknown) { return error instanceof Error && error.message.includes("不存在"); }
