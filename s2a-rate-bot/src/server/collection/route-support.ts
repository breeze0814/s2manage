import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthRequiredError } from "../auth/route-support.ts";

export function sourceId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("采集站 ID 无效");
  return id;
}

export function collectionError(error: unknown) {
  const status = error instanceof AuthRequiredError ? error.status : error instanceof ZodError ? 400 : missing(error) ? 404 : 500;
  const message = error instanceof ZodError
    ? error.issues[0]?.message ?? "采集站配置无效"
    : error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

function missing(error: unknown) {
  return error instanceof Error && error.message.includes("不存在");
}
