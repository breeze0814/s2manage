import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSqliteCollectionStore } from "../src/server/collection/store.ts";
import { HealthPolicyConflictError, HealthProbeError, createConnectionHealthService } from "../src/server/connection-health/service.ts";
import { createSqliteConnectionHealthStore } from "../src/server/connection-health/store.ts";
import { createSqliteConnectionStore } from "../src/server/connections/store.ts";
import { createSqliteRuntimeLeaseStore } from "../src/server/runtime-leases/store.ts";
import type { TargetAccountTestResult } from "../src/server/target-accounts/types.ts";
import { insertActiveConnection, storedSiteInput, TEST_CONNECTION_ID } from "./real-connection-test-support.ts";

const MILLISECONDS_PER_SECOND = 1_000;

test("health thresholds suspend and restore a real target account", async () => {
  const harness = await createHarness([
    failed("first failure"), failed("second failure"), success("first recovery"), success("second recovery"),
  ]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);

    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "degraded");
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "suspended");
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "observing");
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "healthy");
    assert.deepEqual(harness.schedulable, [false, true]);

    const events = await harness.service.events(TEST_CONNECTION_ID);
    assert.equal(events.filter((event) => event.eventType === "probe").length, 4);
    assert.deepEqual(events.filter((event) => event.eventType === "action").map((event) => event.result), ["success", "success"]);
    await assert.rejects(() => harness.service.deletePolicy(policy.id), HealthPolicyConflictError);
    await harness.service.assign(TEST_CONNECTION_ID, null);
    await harness.service.deletePolicy(policy.id);
    assert.deepEqual(await harness.service.listPolicies(), []);
  } finally {
    await harness.close();
  }
});

test("transport probe errors remain visible and are persisted as failed probes", async () => {
  const harness = await createHarness([new Error("channel timeout")]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);

    await assert.rejects(() => harness.service.probe(TEST_CONNECTION_ID), (error: unknown) => {
      assert.equal(error instanceof HealthProbeError, true);
      assert.equal((error as HealthProbeError).execution.monitor.state, "degraded");
      return true;
    });
    const events = await harness.service.events(TEST_CONNECTION_ID);
    assert.deepEqual(
      { type: events[0]?.eventType, result: events[0]?.result, message: events[0]?.message },
      { type: "probe", result: "failure", message: "channel timeout" },
    );
  } finally {
    await harness.close();
  }
});

test("failed automatic suspension stays retryable and retries the remote action", async () => {
  const harness = await createHarness(
    [failed("first failure"), failed("second failure"), failed("third failure")],
    { actionFailures: 1 },
  );
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "degraded");
    await assert.rejects(() => harness.service.probe(TEST_CONNECTION_ID), /schedulable update failed/);
    assert.equal((await harness.service.listMonitors())[0]?.state, "degraded");
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "suspended");
    assert.deepEqual(harness.schedulable, [false, false]);
    const actions = (await harness.service.events(TEST_CONNECTION_ID)).filter((event) => event.eventType === "action");
    assert.deepEqual(actions.map((event) => event.result), ["success", "failure"]);
  } finally {
    await harness.close();
  }
});

test("manual suspension is never overridden by automatic recovery", async () => {
  const harness = await createHarness([success("manual check one"), success("manual check two"), success("restored check")]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    const suspended = await harness.service.act(TEST_CONNECTION_ID, "suspend");
    assert.deepEqual({ state: suspended.state, reason: suspended.suspensionReason }, { state: "suspended", reason: "manual" });
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "suspended");
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "suspended");
    assert.deepEqual(harness.schedulable, [false]);

    const restored = await harness.service.act(TEST_CONNECTION_ID, "restore");
    assert.deepEqual({ state: restored.state, reason: restored.suspensionReason }, { state: "observing", reason: null });
    assert.equal((await harness.service.probe(TEST_CONNECTION_ID)).monitor.state, "observing");
    assert.deepEqual(harness.schedulable, [false, true]);
  } finally {
    await harness.close();
  }
});

test("a policy without automatic suspension remains degraded after its threshold", async () => {
  const harness = await createHarness([failed("first failure"), failed("second failure")]);
  try {
    const policy = await harness.service.createPolicy(policyInput({ autoSuspend: false }));
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.probe(TEST_CONNECTION_ID);
    const execution = await harness.service.probe(TEST_CONNECTION_ID);
    assert.deepEqual(
      { state: execution.monitor.state, reason: execution.monitor.suspensionReason, actions: harness.schedulable },
      { state: "degraded", reason: null, actions: [] },
    );
  } finally {
    await harness.close();
  }
});

test("a policy without automatic restore keeps the target suspended", async () => {
  const harness = await createHarness([
    failed("first failure"), failed("second failure"), success("first recovery"), success("second recovery"),
  ]);
  try {
    const policy = await harness.service.createPolicy(policyInput({ autoRestore: false }));
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.probe(TEST_CONNECTION_ID);
    await harness.service.probe(TEST_CONNECTION_ID);
    await harness.service.probe(TEST_CONNECTION_ID);
    const execution = await harness.service.probe(TEST_CONNECTION_ID);
    assert.deepEqual(
      { state: execution.monitor.state, reason: execution.monitor.suspensionReason, actions: harness.schedulable },
      { state: "suspended", reason: "automatic", actions: [false] },
    );
  } finally {
    await harness.close();
  }
});

test("health ownership preserves an initially disabled remote schedule", async () => {
  const harness = await createHarness([], { initialSchedulable: false });
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.act(TEST_CONNECTION_ID, "suspend");
    const restored = await harness.service.act(TEST_CONNECTION_ID, "restore");
    assert.equal(restored.state, "observing");
    assert.deepEqual(harness.schedulable, []);
  } finally {
    await harness.close();
  }
});

test("external schedule drift is exposed and never overwritten", async () => {
  const harness = await createHarness([]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.act(TEST_CONNECTION_ID, "suspend");
    harness.setRemoteSchedulable(true);

    await assert.rejects(
      () => harness.service.act(TEST_CONNECTION_ID, "restore"),
      /外部修改/,
    );
    assert.deepEqual(harness.schedulable, [false]);
    await harness.service.assign(TEST_CONNECTION_ID, null);
    assert.deepEqual(harness.schedulable, [false]);
  } finally {
    await harness.close();
  }
});

test("a disconnected connection can release health ownership and its policy", async () => {
  const harness = await createHarness([]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.act(TEST_CONNECTION_ID, "suspend");
    harness.connections.finishDisconnect({
      id: TEST_CONNECTION_ID, error: null, at: "2026-01-01T00:01:00.000Z",
    });

    await harness.service.assign(TEST_CONNECTION_ID, null);
    await harness.service.deletePolicy(policy.id);
    assert.deepEqual(await harness.service.listPolicies(), []);
    assert.deepEqual(harness.schedulable, [false, true]);
  } finally {
    await harness.close();
  }
});

test("policy updates reschedule assigned monitors from the update time", async () => {
  const harness = await createHarness([]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    const updated = await harness.service.updatePolicy(policy.id, policyInput({ intervalSeconds: 120 }));
    const monitor = (await harness.service.listMonitors())[0];
    assert.equal(updated.intervalSeconds, 120);
    assert.equal(
      Date.parse(monitor?.nextProbeAt ?? "") - Date.parse(updated.updatedAt),
      updated.intervalSeconds * MILLISECONDS_PER_SECOND,
    );
  } finally {
    await harness.close();
  }
});

test("health event pages include connection identity and stable cursors", async () => {
  const harness = await createHarness([failed("one"), success("two")]);
  try {
    const policy = await harness.service.createPolicy(policyInput());
    await harness.service.assign(TEST_CONNECTION_ID, policy.id);
    await harness.service.probe(TEST_CONNECTION_ID);
    await harness.service.probe(TEST_CONNECTION_ID);

    const first = await harness.service.eventPage(TEST_CONNECTION_ID, 2);
    assert.equal(first.events.length, 2);
    assert.deepEqual(
      [first.events[0]?.sourceSiteName, first.events[0]?.sourceGroupName, first.events[0]?.targetAccountName],
      ["Source", "VIP", "Target Account"],
    );
    assert.equal(typeof first.nextCursor, "number");
    const second = await harness.service.eventPage(TEST_CONNECTION_ID, 2, first.nextCursor!);
    assert.equal(second.events.every((event) => event.id < first.nextCursor!), true);
  } finally {
    await harness.close();
  }
});

async function createHarness(results: Array<TargetAccountTestResult | Error>, options: HealthHarnessOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-health-"));
  const databaseUrl = `file:${join(directory, "app.db")}`;
  const collection = createSqliteCollectionStore(databaseUrl);
  const site = collection.create(storedSiteInput());
  const connections = createSqliteConnectionStore(databaseUrl);
  insertActiveConnection(connections, site.id);
  const health = createSqliteConnectionHealthStore(databaseUrl);
  const leases = createSqliteRuntimeLeaseStore(databaseUrl);
  const schedulable: boolean[] = [];
  let remoteSchedulable = options.initialSchedulable ?? true;
  let actionFailures = options.actionFailures ?? 0;
  let leaseSequence = 0;
  const service = createConnectionHealthService({
    store: health,
    connections,
    leases,
    leaseId: () => `health-test-${leaseSequence++}`,
    now: monotonicClock(),
    concurrency: async () => 2,
    gateway: {
      probe: async () => {
        const result = results.shift();
        if (!result) throw new Error("missing probe result");
        if (result instanceof Error) throw result;
        return result;
      },
      readSchedulable: async () => remoteSchedulable,
      assertSchedulableControl: () => {},
      setSchedulable: async (_accountId, enabled) => {
        schedulable.push(enabled);
        if (actionFailures > 0) { actionFailures -= 1; throw new Error("schedulable update failed"); }
        remoteSchedulable = enabled;
      },
    },
  });
  return { service, schedulable, connections, setRemoteSchedulable: (value: boolean) => { remoteSchedulable = value; }, close: async () => {
    leases.close(); health.close(); connections.close(); collection.close();
    await rm(directory, { recursive: true, force: true });
  } };
}

function policyInput(overrides: Partial<ReturnType<typeof basePolicyInput>> = {}) {
  return { ...basePolicyInput(), ...overrides };
}

function basePolicyInput() { return { name: "Standard", enabled: true, intervalSeconds: 60, failureThreshold: 2, recoveryThreshold: 2, autoSuspend: true, autoRestore: true }; }

function failed(message: string): TargetAccountTestResult { return { success: false, message, latencyMs: 50, model: "gpt-test" }; }
function success(message: string): TargetAccountTestResult { return { success: true, message, latencyMs: 40, model: "gpt-test" }; }
function monotonicClock() { let tick = 0; return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)); }
type HealthHarnessOptions = { readonly actionFailures?: number; readonly initialSchedulable?: boolean };
