import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { getRuntimeTargetGroupService } from "../target-groups/runtime.ts";
import { createWorkerService } from "./service.ts";
import { createSqliteWorkerRunStore } from "./store.ts";

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
  const settings = getRuntimeSettingsService(env);
  const collection = getRuntimeCollectionService(env);
  const targetGroups = getRuntimeTargetGroupService(env);
  const runs = createSqliteWorkerRunStore(env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const worker = createWorkerService({
    settings: async () => workerSettings(await settings.get()),
    collection,
    targetGroups,
    runs,
    now: () => new Date(),
  });
  return {
    ...worker,
    intervalSeconds: async () => (await settings.get()).worker.intervalSeconds,
    close: () => runs.close(),
  };
}

function workerSettings(settings: Awaited<ReturnType<ReturnType<typeof getRuntimeSettingsService>["get"]>>) {
  return { concurrency: settings.worker.concurrency, targetConfigured: Boolean(settings.target) };
}
