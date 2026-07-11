import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const LOG_DIRECTORY = resolve(process.cwd(), "logs");
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const ROTATED_LOG_COUNT = 5;
export const BUSINESS_LOG_FILES = {
  api: "external-api.log",
  worker: "worker.log",
} as const;

export type ExternalApiLog = {
  readonly timestamp: string;
  readonly method: string;
  readonly url: string;
  readonly status: number | null;
  readonly durationMs: number;
  readonly outcome: "success" | "failed";
  readonly error?: string;
};

export async function writeExternalApiLog(entry: ExternalApiLog) {
  await appendBusinessLog(BUSINESS_LOG_FILES.api, { type: "external_api", ...entry });
}

export async function writeWorkerLog(entry: Record<string, unknown>) {
  await appendBusinessLog(BUSINESS_LOG_FILES.worker, { type: "worker", timestamp: new Date().toISOString(), ...entry });
}

async function appendBusinessLog(file: string, entry: Record<string, unknown>) {
  await mkdir(LOG_DIRECTORY, { recursive: true });
  const path = resolve(LOG_DIRECTORY, file);
  const line = `${JSON.stringify(entry)}\n`;
  await rotateIfRequired(path, Buffer.byteLength(line));
  await appendFile(path, line, "utf8");
}

async function rotateIfRequired(path: string, incomingBytes: number) {
  const currentSize = await fileSize(path);
  if (currentSize + incomingBytes <= MAX_LOG_BYTES) return;
  await rm(`${path}.${ROTATED_LOG_COUNT}`, { force: true });
  for (let index = ROTATED_LOG_COUNT - 1; index >= 1; index -= 1) {
    if (await fileExists(`${path}.${index}`)) await rename(`${path}.${index}`, `${path}.${index + 1}`);
  }
  if (await fileExists(path)) await rename(path, `${path}.1`);
}

async function fileSize(path: string) { try { return (await stat(path)).size; } catch (error) { if (isMissing(error)) return 0; throw error; } }
async function fileExists(path: string) { try { await stat(path); return true; } catch (error) { if (isMissing(error)) return false; throw error; } }
function isMissing(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"); }
