import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const HEARTBEAT_DIRECTORY = resolve(process.cwd(), "logs");
const HEARTBEAT_FILE_PREFIX = "worker-heartbeat-";
const HEARTBEAT_TIMEOUT_MS = 90_000;
const HEARTBEAT_RETENTION_MS = HEARTBEAT_TIMEOUT_MS * 2;

export async function writeWorkerHeartbeat() {
  await writeHeartbeatSnapshot(HEARTBEAT_DIRECTORY, { timestamp: new Date().toISOString(), pid: process.pid });
}

export async function writeHeartbeatSnapshot(
  directory: string,
  heartbeat: Readonly<{ timestamp: string; pid: number }>,
) {
  await mkdir(directory, { recursive: true });
  const finalPath = resolve(directory, `${HEARTBEAT_FILE_PREFIX}${Date.now()}-${randomUUID()}.json`);
  const temporaryPath = `${finalPath}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(heartbeat), "utf8");
    await rename(temporaryPath, finalPath);
    await removeExpiredSnapshots(directory, finalPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return finalPath;
}

export async function workerConnectionStatus(now = new Date()) {
  return readHeartbeatStatus(HEARTBEAT_DIRECTORY, now);
}

export async function readHeartbeatStatus(directory: string, now = new Date()) {
  const files = await heartbeatFiles(directory);
  if (files.length === 0) return { connected: false, lastHeartbeatAt: null, pid: null };
  const snapshots = await Promise.all(files.map(readHeartbeat));
  const latest = snapshots.sort((left, right) => right.time - left.time)[0];
  return {
    connected: now.getTime() - latest.time <= HEARTBEAT_TIMEOUT_MS,
    lastHeartbeatAt: latest.timestamp,
    pid: latest.pid,
  };
}

async function heartbeatFiles(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (isMissingFile(error)) return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(HEARTBEAT_FILE_PREFIX) && entry.name.endsWith(".json"))
    .map((entry) => resolve(directory, entry.name));
}

async function readHeartbeat(path: string) {
  const heartbeat = JSON.parse(await readFile(path, "utf8")) as { timestamp?: unknown; pid?: unknown };
  const timestamp = typeof heartbeat.timestamp === "string" ? heartbeat.timestamp : "";
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) throw new Error("Worker 心跳时间无效");
  return { timestamp, time, pid: typeof heartbeat.pid === "number" ? heartbeat.pid : null };
}

async function removeExpiredSnapshots(directory: string, currentPath: string) {
  const cutoff = Date.now() - HEARTBEAT_RETENTION_MS;
  for (const path of await heartbeatFiles(directory)) {
    if (path === currentPath) continue;
    const modifiedAt = (await stat(path)).mtimeMs;
    if (modifiedAt < cutoff) await rm(path, { force: true });
  }
}

function isMissingFile(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
