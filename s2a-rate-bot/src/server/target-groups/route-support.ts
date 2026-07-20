import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";
import { RequestBodyError } from "../http/request-body.ts";

export function targetGroupId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("目标分组 ID 无效");
  return id;
}

export function targetGroupError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof RequestBodyError || error instanceof ZodError ? 400 : missing(error) ? 404 : 502;
  const message = error instanceof ZodError ? error.issues[0]?.message ?? "倍率规则无效" : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

function missing(error: unknown) { return error instanceof Error && error.message.includes("不存在"); }
