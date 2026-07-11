import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthRequiredError, requireAuthenticatedRequest } from "../../../server/auth/route-support";
import { BUSINESS_LOG_FILES } from "../../../server/logging/business-logger";

export const runtime = "nodejs";
const LOG_DIRECTORY = resolve(process.cwd(), "logs");
const MAX_LOG_BYTES = 500_000;
const MAX_ENTRIES = 500;
type LogType = keyof typeof BUSINESS_LOG_FILES;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedRequest(request);
    const type = logType(request.nextUrl.searchParams.get("type"));
    return NextResponse.json(await readBusinessLog(type));
  } catch (error) {
    const status = error instanceof AuthRequiredError ? error.status : error instanceof LogRequestError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

async function readBusinessLog(type: LogType) {
  const file = BUSINESS_LOG_FILES[type];
  const path = resolve(LOG_DIRECTORY, file);
  try {
    const info = await stat(path);
    const content = await readFile(path);
    const start = Math.max(0, content.length - MAX_LOG_BYTES);
    const entries = parseEntries(content.subarray(start).toString("utf8"));
    return { type, file, size: info.size, modifiedAt: info.mtime.toISOString(), entries: entries.slice(-MAX_ENTRIES).reverse() };
  } catch (error) {
    if (isMissingFile(error)) return { type, file, size: 0, modifiedAt: null, entries: [] };
    throw error;
  }
}

function parseEntries(content: string) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    try { return JSON.parse(line) as Record<string, unknown>; }
    catch (error) { throw new Error(`日志第 ${index + 1} 行不是有效 JSON`, { cause: error }); }
  });
}

function logType(value: string | null): LogType {
  if (value === "api" || value === "worker") return value;
  throw new LogRequestError("日志类型必须是 api 或 worker");
}

function isMissingFile(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"); }
class LogRequestError extends Error {}
