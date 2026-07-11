import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HEARTBEAT_FILE = resolve(process.cwd(), "logs", "worker-heartbeat.json");
const HEARTBEAT_TIMEOUT_MS = 90_000;

export async function writeWorkerHeartbeat() {
  await mkdir(resolve(process.cwd(), "logs"), { recursive: true });
  await writeFile(HEARTBEAT_FILE, JSON.stringify({ timestamp: new Date().toISOString(), pid: process.pid }), "utf8");
}

export async function workerConnectionStatus(now = new Date()) {
  try {
    const heartbeat = JSON.parse(await readFile(HEARTBEAT_FILE, "utf8")) as { timestamp?: unknown; pid?: unknown };
    const timestamp = typeof heartbeat.timestamp === "string" ? heartbeat.timestamp : "";
    const heartbeatTime = new Date(timestamp).getTime();
    if (!Number.isFinite(heartbeatTime)) throw new Error("Worker 心跳时间无效");
    return { connected: now.getTime() - heartbeatTime <= HEARTBEAT_TIMEOUT_MS, lastHeartbeatAt: timestamp, pid: typeof heartbeat.pid === "number" ? heartbeat.pid : null };
  } catch (error) {
    if (isMissingFile(error)) return { connected: false, lastHeartbeatAt: null, pid: null };
    throw error;
  }
}

function isMissingFile(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"); }
