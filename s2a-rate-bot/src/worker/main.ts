import { readRuntimeConfig } from "../shared/config.ts";
import type { AppStorage } from "../storage/app-config.ts";
import { createSqliteAppStorage } from "../storage/sqlite-app-storage.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSub2WorkerCycle, type Sub2WorkerSummary } from "./sub2-cycle.ts";

let stopping = false;
let wakeDelay: (() => void) | null = null;

export async function runWorker() {
  const config = readRuntimeConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required before the rate worker can run");
  }
  const storage = createSqliteAppStorage(config.databaseUrl);
  const runOnce = process.env.S2A_WORKER_ONCE === "1";
  let intervalSeconds = await workerIntervalSeconds(storage);
  try {
    console.log(`[worker] sub2 worker started, interval=${intervalSeconds}s, once=${runOnce ? "yes" : "no"}`);
    do {
      logSummary(await runSub2WorkerCycle({ storage }));
      intervalSeconds = await workerIntervalSeconds(storage);
      if (!runOnce && !stopping) await delay(intervalSeconds * 1000);
    } while (!runOnce && !stopping);
  } finally {
    storage.close();
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

export async function workerIntervalSeconds(storage: AppStorage) {
  const config = await storage.getAppConfig();
  const interval = Number(config.worker.intervalSeconds);
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error(`Invalid worker intervalSeconds: ${String(config.worker.intervalSeconds)}`);
  }
  return interval;
}

function logSummary(summary: Sub2WorkerSummary) {
  console.log([
    `[worker] cycle completed`,
    `collected=${summary.collectedSources}`,
    `sourceFailed=${summary.failedSources}`,
    `updatedGroups=${summary.updatedGroups}`,
    `groupFailed=${summary.failedGroups}`,
  ].join(", "));
  for (const error of summary.errors) console.error(`[worker] ${error}`);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeDelay = null;
      resolve();
    }, ms);
    wakeDelay = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolve();
    };
  });
}

function requestStop() {
  stopping = true;
  wakeDelay?.();
}
