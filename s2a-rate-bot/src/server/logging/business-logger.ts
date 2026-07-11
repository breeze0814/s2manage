import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const LOG_DIRECTORY = resolve(process.cwd(), "logs");
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
  await appendFile(resolve(LOG_DIRECTORY, file), `${JSON.stringify(entry)}\n`, "utf8");
}
