import { mapConcurrent } from "../concurrency.ts";
import type { WorkerRunRecord, WorkerRunStore } from "./store.ts";

export type WorkerRunStatus = "running" | "success" | "partial" | "failed";
export type WorkerRunSummary = {
  readonly status: WorkerRunStatus;
  readonly collectedSources: number;
  readonly skippedSources: number;
  readonly failedSources: number;
  readonly appliedGroups: number;
  readonly skippedGroups: number;
  readonly failedGroups: number;
  readonly sentNotifications: number;
  readonly skippedNotifications: number;
  readonly failedNotifications: number;
  readonly errors: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

export type WorkerCycleResult = WorkerRunSummary | {
  readonly status: "skipped";
  readonly reason: "already_running";
  readonly collectedSources: 0;
  readonly skippedSources: 0;
  readonly failedSources: 0;
  readonly appliedGroups: 0;
  readonly skippedGroups: 0;
  readonly failedGroups: 0;
  readonly sentNotifications: 0;
  readonly skippedNotifications: 0;
  readonly failedNotifications: 0;
  readonly errors: readonly [];
  readonly startedAt: null;
  readonly finishedAt: null;
};

type WorkerSource = {
  readonly id: number;
  readonly name: string;
  readonly enabled: boolean;
  readonly intervalSeconds: number;
  readonly lastRunAt: string | null;
};

type WorkerGroup = {
  readonly id: number;
  readonly name: string;
  readonly rule: { readonly enabled: boolean };
};

export type WorkerService = {
  readonly runCycle: () => Promise<WorkerCycleResult>;
  readonly latest: () => WorkerRunRecord | null;
};

export function createWorkerService(input: {
  readonly settings: () => Promise<{ readonly concurrency: number; readonly targetConfigured: boolean }>;
  readonly collection: { readonly list: () => Promise<readonly WorkerSource[]>; readonly refresh: (id: number) => Promise<unknown> };
  readonly targetGroups: { readonly list: () => Promise<readonly WorkerGroup[]>; readonly apply: (id: number) => Promise<{ readonly action: string }> };
  readonly notifications: { readonly run: () => Promise<TaskStats> };
  readonly scheduled: { readonly run: () => Promise<void> };
  readonly runs: WorkerRunStore;
  readonly now: () => Date;
}): WorkerService {
  let running = false;
  return {
    runCycle: async () => {
      if (running) return skippedCycle();
      running = true;
      try {
        return await runPersistedCycle(input);
      } finally {
        running = false;
      }
    },
    latest: () => input.runs.latest(),
  };
}

async function runPersistedCycle(input: WorkerDependencies): Promise<WorkerRunSummary> {
  const startedAt = input.now().toISOString();
  const runId = input.runs.start(startedAt);
  let summary: WorkerRunSummary;
  try {
    summary = await executeCycle(input, startedAt);
  } catch (error) {
    summary = failedSummary(startedAt, input.now().toISOString(), error);
  }
  input.runs.finish(runId, summary);
  return summary;
}

async function executeCycle(input: WorkerDependencies, startedAt: string) {
  const settings = await input.settings();
  const sources = await input.collection.list();
  const due = sources.filter((source) => isDue(source, input.now()));
  const sourceResults = await mapConcurrent({ items: due, concurrency: settings.concurrency, task: (source) => refreshSource(input, source) });
  const sourceStats = summarizeResults(sourceResults);
  const groupStats = settings.targetConfigured
    ? await applyTargetRules(input)
    : emptyStats();
  const notificationStats = await runNotifications(input);
  const scheduledErrors = await runScheduled(input);
  return completedSummary({
    startedAt,
    finishedAt: input.now().toISOString(),
    skippedSources: sources.length - due.length,
    source: sourceStats,
    group: groupStats,
    notification: notificationStats,
    scheduledErrors,
  });
}

async function refreshSource(input: WorkerDependencies, source: WorkerSource): Promise<TaskResult> {
  try {
    await input.collection.refresh(source.id);
    return { outcome: "success" };
  } catch (error) {
    return { outcome: "failed", error: `采集站 ${source.name}(${source.id}): ${errorMessage(error)}` };
  }
}

async function applyTargetRules(input: WorkerDependencies): Promise<TaskStats> {
  try {
    const groups = await input.targetGroups.list();
    const enabled = groups.filter((group) => group.rule.enabled);
    const results = await mapConcurrent({ items: enabled, concurrency: 1, task: (group) => applyGroup(input, group) });
    const stats = summarizeResults(results);
    return { ...stats, skipped: stats.skipped + groups.length - enabled.length };
  } catch (error) {
    return { success: 0, skipped: 0, failed: 1, errors: [`目标分组列表: ${errorMessage(error)}`] };
  }
}

async function applyGroup(input: WorkerDependencies, group: WorkerGroup): Promise<TaskResult> {
  try {
    const result = await input.targetGroups.apply(group.id);
    return { outcome: result.action === "update" ? "success" : "skipped" };
  } catch (error) {
    return { outcome: "failed", error: `目标分组 ${group.name}(${group.id}): ${errorMessage(error)}` };
  }
}

function isDue(source: WorkerSource, now: Date) {
  if (!source.enabled) return false;
  if (!source.lastRunAt) return true;
  const lastRunAt = new Date(source.lastRunAt).getTime();
  if (!Number.isFinite(lastRunAt)) throw new Error(`Invalid lastRunAt for source ${source.id}: ${source.lastRunAt}`);
  return lastRunAt + source.intervalSeconds * 1_000 <= now.getTime();
}

function completedSummary(input: Readonly<{
  startedAt: string;
  finishedAt: string;
  skippedSources: number;
  source: TaskStats;
  group: TaskStats;
  notification: TaskStats;
  scheduledErrors: readonly string[];
}>): WorkerRunSummary {
  const errors = [...input.source.errors, ...input.group.errors, ...input.notification.errors, ...input.scheduledErrors];
  return {
    status: runStatus(input.source.success + input.group.success + input.notification.success, errors.length),
    collectedSources: input.source.success,
    skippedSources: input.skippedSources,
    failedSources: input.source.failed,
    appliedGroups: input.group.success,
    skippedGroups: input.group.skipped,
    failedGroups: input.group.failed,
    sentNotifications: input.notification.success,
    skippedNotifications: input.notification.skipped,
    failedNotifications: input.notification.failed,
    errors,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
}

async function runNotifications(input: WorkerDependencies): Promise<TaskStats> {
  try {
    return await input.notifications.run();
  } catch (error) {
    return { success: 0, skipped: 0, failed: 1, errors: [`Telegram 通知: ${errorMessage(error)}`] };
  }
}

async function runScheduled(input: WorkerDependencies) {
  try {
    await input.scheduled.run();
    return [];
  } catch (error) {
    return [`抽奖定时任务: ${errorMessage(error)}`];
  }
}

function failedSummary(startedAt: string, finishedAt: string, error: unknown): WorkerRunSummary {
  return { status: "failed", collectedSources: 0, skippedSources: 0, failedSources: 0,
    appliedGroups: 0, skippedGroups: 0, failedGroups: 0, sentNotifications: 0,
    skippedNotifications: 0, failedNotifications: 0, errors: [errorMessage(error)], startedAt, finishedAt };
}

function summarizeResults(results: readonly TaskResult[]): TaskStats {
  return results.reduce<TaskStats>((stats, result) => ({
    success: stats.success + Number(result.outcome === "success"),
    skipped: stats.skipped + Number(result.outcome === "skipped"),
    failed: stats.failed + Number(result.outcome === "failed"),
    errors: result.error ? [...stats.errors, result.error] : stats.errors,
  }), emptyStats());
}

function runStatus(successes: number, failures: number): WorkerRunStatus {
  if (failures === 0) return "success";
  return successes > 0 ? "partial" : "failed";
}

function skippedCycle(): Extract<WorkerCycleResult, { status: "skipped" }> {
  return { status: "skipped", reason: "already_running", collectedSources: 0, skippedSources: 0,
    failedSources: 0, appliedGroups: 0, skippedGroups: 0, failedGroups: 0,
    sentNotifications: 0, skippedNotifications: 0, failedNotifications: 0,
    errors: [], startedAt: null, finishedAt: null };
}

function emptyStats(): TaskStats { return { success: 0, skipped: 0, failed: 0, errors: [] }; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type TaskResult = { readonly outcome: "success" | "skipped" | "failed"; readonly error?: string };
type TaskStats = { readonly success: number; readonly skipped: number; readonly failed: number; readonly errors: readonly string[] };
type WorkerDependencies = Parameters<typeof createWorkerService>[0];
