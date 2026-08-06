import { getRuntimeCollectionService } from "../collection/runtime.ts";
import { getRuntimeInfrastructure } from "../infrastructure/runtime.ts";
import { getRuntimeSettingsService } from "../settings/runtime.ts";
import { getRuntimeTargetGroupService } from "../target-groups/runtime.ts";
import { createWorkerService } from "./service.ts";
import { createPostgresWorkerRunStore } from "./postgres-store.ts";
import { writeWorkerLog } from "../logging/business-logger.ts";
import { createPostgresMaintenance } from "../../storage/postgres-maintenance.ts";
import { getRuntimeTelegramNotificationService } from "../telegram/runtime.ts";
import { getRuntimeEmbedServices } from "../embeds/runtime.ts";
import { createConnectionHealthRuntime } from "../connection-health/runtime.ts";
import { createConnectionRuntime } from "../connections/runtime.ts";

type RuntimeWorkerService = ReturnType<typeof buildRuntimeWorkerService>;
const globalWorker = globalThis as typeof globalThis & { s2aWorkerService?: RuntimeWorkerService };

export function getRuntimeWorkerService(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && globalWorker.s2aWorkerService) return globalWorker.s2aWorkerService;
  const service = buildRuntimeWorkerService(env);
  if (env === process.env) globalWorker.s2aWorkerService = service;
  return service;
}

function buildRuntimeWorkerService(env: NodeJS.ProcessEnv) {
  const infrastructure = getRuntimeInfrastructure(env);
  const settings = getRuntimeSettingsService(env);
  const collection = getRuntimeCollectionService(env);
  const targetGroups = getRuntimeTargetGroupService(env);
  const runs = createPostgresWorkerRunStore(infrastructure.postgres);
  const maintenance = createPostgresMaintenance(infrastructure.postgres);
  const notifications = getRuntimeTelegramNotificationService(env);
  const embeds = getRuntimeEmbedServices(env);
  const connectionHealth = createConnectionHealthRuntime(env);
  const connections = createConnectionRuntime(env);
  const worker = createWorkerService({
    settings: async () => workerSettings(await settings.get()),
    collection,
    targetGroups,
    notifications,
    scheduled: { run: async () => { await connections.service.reconcile(); } },
    runs,
    now: () => new Date(),
  });
  return {
    ...worker,
    runCycle: async () => runMaintainedCycle(worker.runCycle, maintenance),
    runHealthCycle: () => connectionHealth.service.runDue(),
    runLotteryCycle: () => runScheduledTasks([
      () => embeds.lottery.processDue(),
      () => embeds.lottery.processRewards(),
    ]),
    nextHealthDueAt: () => connectionHealth.service.nextDueAt(),
    intervalSeconds: async () => (await settings.get()).worker.intervalSeconds,
    close: async () => {
      connections.close();
      connectionHealth.close();
      notifications.close();
      await maintenance.close();
      await runs.close();
      await embeds.close();
      await infrastructure.close();
    },
  };
}

async function runScheduledTasks(tasks: readonly (() => Promise<unknown>)[]) {
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "后台定时任务执行失败");
}

async function runMaintainedCycle(
  runCycle: () => ReturnType<ReturnType<typeof createWorkerService>["runCycle"]>,
  maintenance: ReturnType<typeof createPostgresMaintenance>,
) {
  const result = await loggedWorkerCycle(runCycle);
  const cleanup = await maintenance.runIfDue();
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
