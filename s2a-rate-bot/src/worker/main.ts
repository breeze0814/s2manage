import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRuntimeWorkerService } from "../server/worker/runtime.ts";
import { writeWorkerLog } from "../server/logging/business-logger.ts";
import { writeWorkerHeartbeat } from "../server/worker/heartbeat.ts";
import type { WorkerCycleResult } from "../server/worker/service.ts";

const HEALTH_SCHEDULER_POLL_MS = 1_000;
const HEALTH_RETRY_DELAY_MS = 250;
const HEARTBEAT_INTERVAL_MS = 30_000;
let stopping = false;
const wakeDelays = new Set<() => void>();

export async function runWorker() {
  stopping = false;
  const worker = getRuntimeWorkerService();
  const runOnce = process.env.S2A_WORKER_ONCE === "1";
  const heartbeat = startHeartbeat();
  try {
    await writeWorkerLog({ event: "worker_started", runOnce });
    console.log(`[worker] started, once=${runOnce ? "yes" : "no"}`);
    await runLoops(worker, runOnce);
  } finally {
    clearInterval(heartbeat);
    await writeWorkerLog({ event: "worker_stopped" });
    worker.close();
  }
}

function startHeartbeat() {
  void writeWorkerHeartbeat();
  return setInterval(() => { void writeWorkerHeartbeat(); }, HEARTBEAT_INTERVAL_MS);
}

async function runLoops(
  worker: ReturnType<typeof getRuntimeWorkerService>,
  runOnce: boolean,
) {
  const loops = [runCollectionLoop(worker, runOnce), runHealthLoop(worker, runOnce)];
  try {
    await Promise.all(loops);
  } catch (error) {
    requestStop();
    await Promise.allSettled(loops);
    throw error;
  }
}

async function runCollectionLoop(
  worker: ReturnType<typeof getRuntimeWorkerService>,
  runOnce: boolean,
) {
  do {
    logSummary(await worker.runCycle());
    if (!runOnce && !stopping) await delay((await worker.intervalSeconds()) * 1_000);
  } while (!runOnce && !stopping);
}

async function runHealthLoop(
  worker: ReturnType<typeof getRuntimeWorkerService>,
  runOnce: boolean,
) {
  do {
    const acquired = await runHealthCycle(worker, runOnce);
    if (runOnce || stopping) return;
    await delay(await healthDelay(worker, acquired));
  } while (!runOnce && !stopping);
}

async function runHealthCycle(
  worker: ReturnType<typeof getRuntimeWorkerService>,
  runOnce: boolean,
) {
  try {
    return await worker.runHealthCycle();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeWorkerLog({ event: "connection_health_cycle_failed", error: message });
    console.error(`[worker] connection health: ${message}`);
    if (runOnce) throw error;
    return true;
  }
}

async function healthDelay(
  worker: ReturnType<typeof getRuntimeWorkerService>,
  acquired: boolean,
) {
  if (!acquired) return HEALTH_RETRY_DELAY_MS;
  const dueAt = await worker.nextHealthDueAt();
  if (!dueAt) return HEALTH_SCHEDULER_POLL_MS;
  const timestamp = Date.parse(dueAt);
  if (!Number.isFinite(timestamp)) throw new Error(`健康策略到期时间无效: ${dueAt}`);
  return Math.max(HEALTH_RETRY_DELAY_MS, Math.min(HEALTH_SCHEDULER_POLL_MS, timestamp - Date.now()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
  runWorker().catch((error) => {
    void writeWorkerLog({ event: "worker_failed", error: error instanceof Error ? error.message : String(error) });
    console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

function logSummary(summary: WorkerCycleResult) {
  if (summary.status === "skipped") {
    console.warn(`[worker] cycle skipped: ${summary.reason}`);
    return;
  }
  console.log([
    `[worker] cycle ${summary.status}`,
    `collected=${summary.collectedSources}`,
    `sourceFailed=${summary.failedSources}`,
    `appliedGroups=${summary.appliedGroups}`,
    `groupFailed=${summary.failedGroups}`,
    `notifications=${summary.sentNotifications}`,
    `notificationFailed=${summary.failedNotifications}`,
  ].join(", "));
  for (const error of summary.errors) console.error(`[worker] ${error}`);
}

function delay(ms: number) {
  return new Promise<void>((resolveDelay) => {
    const timer = setTimeout(() => {
      wakeDelays.delete(wake);
      resolveDelay();
    }, ms);
    const wake = () => {
      clearTimeout(timer);
      wakeDelays.delete(wake);
      resolveDelay();
    };
    wakeDelays.add(wake);
  });
}

function requestStop() {
  stopping = true;
  for (const wake of [...wakeDelays]) wake();
}
