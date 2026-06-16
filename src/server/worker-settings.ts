import type { PrismaClient } from "@prisma/client";

export const workerSettingKeys = [
  "worker_interval_seconds",
  "upstream_monitor_timeout_seconds",
  "upstream_monitor_concurrency",
] as const;

export const defaultWorkerIntervalSeconds = 10 * 60;
export const defaultUpstreamMonitorTimeoutSeconds = 45;
export const defaultUpstreamMonitorConcurrency = 3;

type SettingRow = { key: string; value: string };
type SettingsDb = Pick<PrismaClient, "setting">;

function finiteInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && Number.isFinite(numeric) ? numeric : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeWorkerIntervalSeconds(value: unknown, fallback: unknown = defaultWorkerIntervalSeconds) {
  return clamp(finiteInteger(value) ?? finiteInteger(fallback) ?? defaultWorkerIntervalSeconds, 60, 24 * 60 * 60);
}

export function normalizeUpstreamMonitorTimeoutSeconds(value: unknown, fallback: unknown = defaultUpstreamMonitorTimeoutSeconds) {
  return clamp(finiteInteger(value) ?? finiteInteger(fallback) ?? defaultUpstreamMonitorTimeoutSeconds, 10, 5 * 60);
}

export function normalizeUpstreamMonitorConcurrency(value: unknown, fallback: unknown = defaultUpstreamMonitorConcurrency) {
  return clamp(finiteInteger(value) ?? finiteInteger(fallback) ?? defaultUpstreamMonitorConcurrency, 1, 20);
}

export function workerRuntimeSettingsFromRows(rows: SettingRow[], env: NodeJS.ProcessEnv = process.env) {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    workerIntervalSeconds: normalizeWorkerIntervalSeconds(map.get("worker_interval_seconds"), env.S2A_WORKER_INTERVAL_SECONDS),
    upstreamMonitorTimeoutSeconds: normalizeUpstreamMonitorTimeoutSeconds(map.get("upstream_monitor_timeout_seconds"), env.S2A_UPSTREAM_MONITOR_TIMEOUT_SECONDS),
    upstreamMonitorConcurrency: normalizeUpstreamMonitorConcurrency(map.get("upstream_monitor_concurrency"), env.S2A_UPSTREAM_MONITOR_CONCURRENCY),
  };
}

export async function getWorkerRuntimeSettings(db: SettingsDb, env: NodeJS.ProcessEnv = process.env) {
  const rows = await db.setting.findMany({ where: { key: { in: [...workerSettingKeys] } } });
  return workerRuntimeSettingsFromRows(rows, env);
}
