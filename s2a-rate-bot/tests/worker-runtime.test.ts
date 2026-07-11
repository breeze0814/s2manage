import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

async function loadModules() {
  const paths = ["src/server/worker/service.ts", "src/server/worker/store.ts", "src/server/worker/concurrency.ts"];
  for (const path of paths) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
  const [service, store] = await Promise.all([
    import("../src/server/worker/service.ts"),
    import("../src/server/worker/store.ts"),
  ]);
  return { service, store };
}

async function withWorker<T>(dependencies: WorkerDependencies, task: (context: Awaited<ReturnType<typeof workerContext>>) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-worker-"));
  const context = await workerContext(`file:${join(directory, "app.db")}`, dependencies);
  try {
    return await task(context);
  } finally {
    context.store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function workerContext(databaseUrl: string, dependencies: WorkerDependencies) {
  const modules = await loadModules();
  const store = modules.store.createSqliteWorkerRunStore(databaseUrl);
  const worker = modules.service.createWorkerService({ ...dependencies, runs: store });
  return { ...modules, store, worker };
}

test("worker collects due Sub2API and NewAPI sites with configured concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const refreshed: number[] = [];
  const sites = [
    site(1, "sub2api", null, true),
    site(2, "newapi", null, true),
    site(3, "sub2api", new Date("2026-07-11T00:00:00Z").toISOString(), true),
    site(4, "newapi", null, false),
  ];
  const dependencies = baseDependencies({
    now: () => new Date("2026-07-11T00:05:00Z"),
    collection: {
      list: async () => sites,
      refresh: async (id: number) => {
        active += 1; maxActive = Math.max(maxActive, active); refreshed.push(id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
      },
    },
  });

  await withWorker(dependencies, async ({ worker, store }) => {
    const summary = await worker.runCycle();

    assert.deepEqual(refreshed.sort(), [1, 2]);
    assert.equal(maxActive, 2);
    assert.equal(summary.collectedSources, 2);
    assert.equal(summary.skippedSources, 2);
    assert.equal(store.latest()?.status, "success");
  });
});

test("worker records collection and rule failures without hiding successful tasks", async () => {
  const dependencies = baseDependencies({
    collection: {
      list: async () => [site(1, "sub2api", null, true), site(2, "newapi", null, true)],
      refresh: async (id: number) => { if (id === 2) throw new Error("newapi unavailable"); },
    },
    targetGroups: {
      list: async () => [{ id: 7, name: "A", rule: { enabled: true } }, { id: 8, name: "B", rule: { enabled: true } }, { id: 9, name: "C", rule: { enabled: false } }],
      apply: async (id: number) => { if (id === 8) throw new Error("target rejected"); return { action: "update" }; },
    },
  });

  await withWorker(dependencies, async ({ worker, store }) => {
    const summary = await worker.runCycle();

    assert.equal(summary.collectedSources, 1);
    assert.equal(summary.failedSources, 1);
    assert.equal(summary.appliedGroups, 1);
    assert.equal(summary.failedGroups, 1);
    assert.match(summary.errors.join("\n"), /newapi unavailable/);
    assert.match(summary.errors.join("\n"), /target rejected/);
    assert.equal(store.latest()?.status, "partial");
  });
});

test("overlapping worker cycles are rejected explicitly", async () => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const dependencies = baseDependencies({
    collection: { list: async () => [site(1, "sub2api", null, true)], refresh: async () => waiting },
  });

  await withWorker(dependencies, async ({ worker }) => {
    const first = worker.runCycle();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlapping = await worker.runCycle();
    assert.equal(overlapping.status, "skipped");
    assert.equal(overlapping.reason, "already_running");
    release?.();
    await first;
  });
});

test("worker entry and status route use the generic worker service", () => {
  const entry = readFileSync(new URL("src/worker/main.ts", ROOT), "utf8");
  const status = readFileSync(new URL("src/app/api/worker/status/route.ts", ROOT), "utf8");
  assert.match(entry, /getRuntimeWorkerService/);
  assert.match(entry, /writeWorkerHeartbeat/);
  assert.match(status, /workerConnectionStatus/);
  assert.doesNotMatch(entry, /siteType\s*===\s*["']sub2api/);
  assert.equal(existsSync(new URL("src/app/api/worker/status/route.ts", ROOT)), true);
});

function baseDependencies(overrides: Partial<WorkerDependencies> = {}): WorkerDependencies {
  return {
    settings: async () => ({ concurrency: 2, targetConfigured: true }),
    collection: { list: async () => [], refresh: async () => undefined },
    targetGroups: { list: async () => [], apply: async () => ({ action: "skip" }) },
    now: () => new Date("2026-07-11T01:00:00Z"),
    ...overrides,
  };
}

function site(id: number, siteType: string, lastRunAt: string | null, enabled: boolean) {
  return { id, name: `Site ${id}`, siteType, enabled, intervalSeconds: 600, lastRunAt };
}

type WorkerDependencies = {
  readonly settings: () => Promise<{ concurrency: number; targetConfigured: boolean }>;
  readonly collection: { readonly list: () => Promise<ReturnType<typeof site>[]>; readonly refresh: (id: number) => Promise<unknown> };
  readonly targetGroups: { readonly list: () => Promise<Array<{ id: number; name: string; rule: { enabled: boolean } }>>; readonly apply: (id: number) => Promise<{ action: string }> };
  readonly now: () => Date;
};
