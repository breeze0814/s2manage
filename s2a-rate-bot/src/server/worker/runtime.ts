import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { getRuntimeTargetGroupService } from "../target-groups/runtime.ts";
import { createWorkerService } from "./service.ts";
import { createSqliteWorkerRunStore } from "./store.ts";
import { writeWorkerLog } from "../logging/business-logger.ts";
import { createSqliteMaintenance } from "../../storage/sqlite-maintenance.ts";

const DEFAULT_DATABASE_URL = "file:./data/s2a-rate-bot.db";
type RuntimeWorkerService = ReturnType<typeof buildRuntimeWorkerService>;
const globalWorker = globalThis as typeof globalThis & { s2aWorkerService?: RuntimeWorkerService };

export function getRuntimeWorkerService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalWorker.s2aWorkerService) return globalWorker.s2aWorkerService;
  const service = buildRuntimeWorkerService(env);
  if (env === process.env) globalWorker.s2aWorkerService = service;
  return service;
}

function buildRuntimeWorkerService(env: NodeJS.ProcessEnv) {
  const databaseUrl = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const settings = getRuntimeSettingsService(env);
  const collection = getRuntimeCollectionService(env);
  const targetGroups = getRuntimeTargetGroupService(env);
  const runs = createSqliteWorkerRunStore(databaseUrl);
  const maintenance = createSqliteMaintenance(databaseUrl);
  const worker = createWorkerService({
    settings: async () => workerSettings(await settings.get()),
    collection,
    targetGroups,
    runs,
    now: () => new Date(),
  });
  return {
    ...worker,
    runCycle: async () => runMaintainedCycle(worker.runCycle, maintenance),
    intervalSeconds: async () => (await settings.get()).worker.intervalSeconds,
    close: () => { maintenance.close(); runs.close(); },
  };
}

async function runMaintainedCycle(
  runCycle: () => ReturnType<ReturnType<typeof createWorkerService>["runCycle"]>,
  maintenance: ReturnType<typeof createSqliteMaintenance>,
) {
  const result = await loggedWorkerCycle(runCycle);
  const cleanup = maintenance.runIfDue();
  if (cleanup) await writeWorkerLog({ event: "database_cleanup_completed", ...cleanup });
  return result;
}

async function loggedWorkerCycle(runCycle: () => ReturnType<ReturnType<typeof createWorkerService>["runCycle"]>) {
  const result = await runCycle();
  await writeWorkerLog(result.status === "skipped" ? { event: "cycle_skipped", ...result } : { event: "cycle_completed", ...result });
  return result;
}

function workerSettings(settings: Awaited<ReturnType<ReturnType<typeof getRuntimeSettingsService>["get"]>>) {
  return { concurrency: settings.worker.concurrency, targetConfigured: Boolean(settings.target) };
}
