import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRuntimeWorkerService } from "../server/worker/runtime.ts";
import type { WorkerCycleResult } from "../server/worker/service.ts";

let stopping = false;
let wakeDelay: (() => void) | null = null;

export async function runWorker() {
  const worker = getRuntimeWorkerService();
  const runOnce = process.env.S2A_WORKER_ONCE === "1";
  try {
    console.log(`[worker] started, once=${runOnce ? "yes" : "no"}`);
    do {
      logSummary(await worker.runCycle());
      if (!runOnce && !stopping) await delay((await worker.intervalSeconds()) * 1_000);
    } while (!runOnce && !stopping);
  } finally {
    worker.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
  runWorker().catch((error) => {
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
  ].join(", "));
  for (const error of summary.errors) console.error(`[worker] ${error}`);
}

function delay(ms: number) {
  return new Promise<void>((resolveDelay) => {
    const timer = setTimeout(() => {
      wakeDelay = null;
      resolveDelay();
    }, ms);
    wakeDelay = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolveDelay();
    };
  });
}

function requestStop() {
  stopping = true;
  wakeDelay?.();
}
