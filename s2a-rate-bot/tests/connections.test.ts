import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSqliteCollectionStore } from "../src/server/collection/store.ts";
import { createConnectionService } from "../src/server/connections/service.ts";
import { createSqliteConnectionStore } from "../src/server/connections/store.ts";
import type { ConnectionRemoteGateway, ConnectionTargetGroup } from "../src/server/connections/types.ts";
import { createSqliteRuntimeLeaseStore } from "../src/server/runtime-leases/store.ts";
import { buildResourceName } from "../src/server/connections/model.ts";
import { recordVipRate, storedSiteInput, TEST_CONNECTION_ID } from "./real-connection-test-support.ts";

test("managed connection provisions once and fully disconnects both remote resources", async () => {
  const harness = await createHarness();
  try {
    const created = await harness.service.create(createInput());
    const retried = await harness.service.create(createInput());

    assert.equal(created.status, "active");
    assert.equal(retried.id, created.id);
    assert.deepEqual(harness.calls.created, ["source", "target"]);
    assert.deepEqual(harness.calls.names, ["source:Source-VIP-2", "target:Source-VIP-2"]);
    assert.equal(created.resourceName, "Source-VIP-2");
    assert.deepEqual(harness.pricing.bindings(), [7]);
    assert.equal(harness.collection.rates(harness.siteId)[0]?.groupType, "openai");

    const disconnected = await harness.service.disconnect(created.id, { mode: "full", removePricingMapping: true });
    assert.equal(disconnected.status, "disconnected");
    assert.equal(disconnected.pricingMappingEnabled, false);
    assert.equal(disconnected.sourceCredentialDeleted, true);
    assert.equal(disconnected.targetAccountDeleted, true);
    assert.deepEqual(harness.calls.deleted, ["target:99", "source:credential-1"]);
    assert.deepEqual(harness.pricing.bindings(), []);
  } finally {
    await harness.close();
  }
});

test("managed resource names use source identity and effective rate", () => {
  assert.equal(buildResourceName({
    sourceSiteName: "采集 站",
    sourceGroupName: "VIP Group",
    effectiveRate: 1.234567,
  }), "采集-站-VIP-Group-1.2346");
  const truncated = buildResourceName({
    sourceSiteName: "S".repeat(60),
    sourceGroupName: "G".repeat(60),
    effectiveRate: 1.25,
  });
  assert.equal(truncated.length, 80);
  assert.equal(truncated.endsWith("-1.25"), true);
});

test("rate changes rename managed target accounts and persist the remote result", async () => {
  const harness = await createHarness();
  try {
    const created = await harness.service.create(createInput());
    recordVipRate(harness.collection, harness.siteId, 2.5);

    assert.equal(await harness.service.syncAccountNames(harness.siteId), 1);
    assert.deepEqual(harness.calls.renamed, ["99:Source-VIP-2.5"]);
    assert.equal((await harness.service.get(created.id)).targetAccountName, "Source-VIP-2.5");
    assert.equal(await harness.service.syncAccountNames(harness.siteId), 0);
    assert.deepEqual(harness.calls.renamed, ["99:Source-VIP-2.5"]);
  } finally {
    await harness.close();
  }
});

test("account name sync retries failures and leaves existing-resource bindings unchanged", async () => {
  const managed = await createHarness({ targetRenameFailures: 1 });
  try {
    const created = await managed.service.create(createInput());
    recordVipRate(managed.collection, managed.siteId, 3);
    await assert.rejects(managed.service.syncAccountNames(managed.siteId), /目标账号名称同步失败: target rename failed/);
    assert.equal((await managed.service.get(created.id)).targetAccountName, "Source-VIP-2");
    assert.equal(await managed.service.syncAccountNames(managed.siteId), 1);
    assert.deepEqual(managed.calls.renamed, ["99:Source-VIP-3", "99:Source-VIP-3"]);
  } finally {
    await managed.close();
  }

  const existing = await createHarness({ resourcesExist: true });
  try {
    await existing.service.create(existingInput());
    recordVipRate(existing.collection, existing.siteId, 3);
    assert.equal(await existing.service.syncAccountNames(existing.siteId), 0);
    assert.deepEqual(existing.calls.renamed, []);
  } finally {
    await existing.close();
  }
});

test("failed target provisioning keeps recoverable state and supports an idempotent retry", async () => {
  const harness = await createHarness({ targetCreateFailures: 1 });
  try {
    await assert.rejects(() => harness.service.create(createInput()), /target create failed/);

    const connection = harness.store.get(TEST_CONNECTION_ID);
    assert.equal(connection?.status, "error");
    assert.equal(connection?.lifecycleAction, "provision");
    assert.equal(connection?.pricingMappingEnabled, false);
    assert.equal(connection?.sourceCredentialDeleted, false);
    assert.equal(connection?.targetAccountId, null);
    assert.deepEqual(harness.calls.deleted, []);

    const retried = await harness.service.create(createInput());
    assert.equal(retried.status, "active");
    assert.equal(retried.pricingMappingEnabled, true);
    assert.deepEqual(harness.calls.created, ["source", "target", "target"]);
  } finally {
    await harness.close();
  }
});

test("worker reconciliation reuses a target created before a lost response", async () => {
  const harness = await createHarness({ targetResponseFailures: 1 });
  try {
    await assert.rejects(() => harness.service.create(createInput()), /target response lost/);
    assert.equal(harness.store.get(TEST_CONNECTION_ID)?.lifecycleAction, "provision");

    assert.equal(await harness.service.reconcile(), true);
    const recovered = await harness.service.get(TEST_CONNECTION_ID);
    assert.equal(recovered.status, "active");
    assert.deepEqual(harness.calls.created, ["source", "target"]);
  } finally {
    await harness.close();
  }
});

test("partial remote deletion is persisted and only the remaining resource is retried", async () => {
  const harness = await createHarness({ sourceDeleteFailures: 1 });
  try {
    const created = await harness.service.create(createInput());
    await assert.rejects(
      () => harness.service.disconnect(created.id, { mode: "full", removePricingMapping: true }),
      /source delete failed/,
    );
    assert.deepEqual(resourceState(harness.store.get(created.id)), { status: "error", source: false, target: true });

    const disconnected = await harness.service.disconnect(created.id, { mode: "full", removePricingMapping: true });
    assert.equal(disconnected.status, "disconnected");
    assert.deepEqual(harness.calls.deleted, ["target:99", "source:credential-1", "source:credential-1"]);
  } finally {
    await harness.close();
  }
});

test("a managed connection can unlink first and delete retained resources later", async () => {
  const harness = await createHarness();
  try {
    const created = await harness.service.create(createInput());
    const unlinked = await harness.service.disconnect(created.id, { mode: "unlink", removePricingMapping: true });
    assert.deepEqual(
      { status: unlinked.status, canDeleteRemote: unlinked.canDeleteRemote, deleted: harness.calls.deleted },
      { status: "disconnected", canDeleteRemote: true, deleted: [] },
    );

    const cleaned = await harness.service.disconnect(created.id, { mode: "full", removePricingMapping: true });
    assert.deepEqual(
      { status: cleaned.status, canDeleteRemote: cleaned.canDeleteRemote, deleted: harness.calls.deleted },
      { status: "disconnected", canDeleteRemote: false, deleted: ["target:99", "source:credential-1"] },
    );
  } finally {
    await harness.close();
  }
});

test("existing resources bind without provisioning and cannot be remotely deleted", async () => {
  const harness = await createHarness({ resourcesExist: true });
  try {
    const created = await harness.service.create(existingInput());
    assert.deepEqual(
      { status: created.status, mode: created.provisioningMode, created: harness.calls.created },
      { status: "active", mode: "existing", created: [] },
    );
    await assert.rejects(
      () => harness.service.disconnect(created.id, { mode: "full", removePricingMapping: true }),
      /现有资源绑定不允许自动删除远端资源/,
    );
    assert.deepEqual(harness.calls.deleted, []);
  } finally {
    await harness.close();
  }
});

test("lifecycle event pages include connection identity and stable cursors", async () => {
  const harness = await createHarness();
  try {
    const created = await harness.service.create(createInput());
    const first = await harness.service.eventPage(created.id, 2);
    assert.equal(first.events.length, 2);
    assert.equal(first.events[0]?.sourceSiteName, "Source");
    assert.equal(first.events[0]?.sourceGroupName, "VIP");
    assert.equal(first.events[0]?.targetAccountName, created.targetAccountName);
    assert.equal(typeof first.nextCursor, "number");

    const second = await harness.service.eventPage(created.id, 2, first.nextCursor!);
    assert.equal(second.events.length, 2);
    assert.equal(second.events.every((event) => event.id < first.nextCursor!), true);
  } finally {
    await harness.close();
  }
});

function createInput() {
  return { sourceSiteId: 1, sourceGroupId: "vip", targetGroupIds: [7], groupType: "openai", addToPricingMapping: true, operationId: "operation-create-1" };
}

function existingInput() {
  return {
    ...createInput(), operationId: "operation-existing-1", mode: "existing",
    sourceCredentialId: "credential-1", targetAccountId: 99,
  };
}

async function createHarness(options: RemoteOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-connections-"));
  const databaseUrl = `file:${join(directory, "app.db")}`;
  const collection = createSqliteCollectionStore(databaseUrl);
  const site = collection.create(storedSiteInput());
  recordVipRate(collection, site.id);
  const store = createSqliteConnectionStore(databaseUrl);
  const leases = createSqliteRuntimeLeaseStore(databaseUrl);
  const calls: RemoteCalls = { created: [], deleted: [], names: [], renamed: [] };
  const pricing = createPricing(site.id);
  const service = createConnectionService({
    store, remote: createRemote(calls, options), id: () => TEST_CONNECTION_ID,
    leaseId: monotonicId(), leases, concurrency: async () => 2,
    health: { release: async () => null },
    now: monotonicClock(),
    sources: {
      sites: async () => collection.list(), rates: async () => collection.rates(),
      setGroupType: async (siteId, groupId, groupType) => collection.setRateGroupType(siteId, groupId, groupType),
    },
    pricing: pricing.api,
  });
  return { service, store, collection, siteId: site.id, calls, pricing,
    close: async () => { leases.close(); store.close(); collection.close(); await rm(directory, { recursive: true, force: true }); } };
}

function createRemote(calls: RemoteCalls, options: RemoteOptions): ConnectionRemoteGateway {
  let sourceDeleteFailures = options.sourceDeleteFailures ?? 0;
  let targetCreateFailures = options.targetCreateFailures ?? 0;
  let targetResponseFailures = options.targetResponseFailures ?? 0;
  let targetRenameFailures = options.targetRenameFailures ?? 0;
  let sourceExists = options.resourcesExist ?? false;
  let targetExists = options.resourcesExist ?? false;
  return {
    ensureSourceCredential: async ({ name }) => {
      calls.names.push(`source:${name}`);
      if (!sourceExists) { sourceExists = true; calls.created.push("source"); }
      return { id: "credential-1", key: "secret-key" };
    },
    listSourceCredentials: async () => sourceExists
      ? [{ id: "credential-1", name: "managed", groupId: "vip", status: "active" }]
      : [],
    deleteSourceCredential: async (_siteId, id) => {
      calls.deleted.push(`source:${id}`);
      if (sourceDeleteFailures > 0) { sourceDeleteFailures -= 1; throw new Error("source delete failed"); }
    },
    ensureTargetAccount: async ({ name }) => {
      calls.names.push(`target:${name}`);
      if (!targetExists) calls.created.push("target");
      if (targetCreateFailures > 0) { targetCreateFailures -= 1; throw new Error("target create failed"); }
      targetExists = true;
      if (targetResponseFailures > 0) { targetResponseFailures -= 1; throw new Error("target response lost"); }
      return { id: 99, name };
    },
    listTargetAccounts: async () => targetExists
      ? [{ id: 99, name: "managed", platform: "openai", status: "active", groupIds: [7] }]
      : [],
    renameTargetAccount: async (id, name) => {
      calls.renamed.push(`${id}:${name}`);
      if (targetRenameFailures > 0) { targetRenameFailures -= 1; throw new Error("target rename failed"); }
    },
    deleteTargetAccount: async (id) => { targetExists = false; calls.deleted.push(`target:${id}`); },
  };
}

function createPricing(siteId: number) {
  let groups: ConnectionTargetGroup[] = [{ id: 7, name: "Target VIP", platform: "openai", bindings: [] }];
  const api = {
    groups: async () => groups,
    save: async (raw: unknown) => {
      const input = raw as PricingSave;
      groups = groups.map((group) => ({ ...group, bindings: updateBindings(group, input) }));
    },
  };
  return { api, bindings: () => groups.filter((group) => group.bindings.some((binding) => binding.sourceSiteId === siteId)).map((group) => group.id) };
}

function updateBindings(group: ConnectionTargetGroup, input: PricingSave) {
  const other = group.bindings.filter((binding) => binding.sourceSiteId !== input.sourceSiteId || binding.sourceGroupId !== input.sourceGroupId);
  return input.targetGroupIds.includes(group.id) ? [...other, { sourceSiteId: input.sourceSiteId, sourceGroupId: input.sourceGroupId }] : other;
}

function monotonicClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}

function monotonicId() { let id = 0; return () => `connection-lease-${id++}`; }

function resourceState(connection: ReturnType<ReturnType<typeof createSqliteConnectionStore>["get"]>) {
  return connection && { status: connection.status, source: connection.sourceCredentialDeleted, target: connection.targetAccountDeleted };
}

type RemoteCalls = { readonly created: string[]; readonly deleted: string[]; readonly names: string[]; readonly renamed: string[] };
type RemoteOptions = {
  readonly targetCreateFailures?: number;
  readonly targetResponseFailures?: number;
  readonly targetRenameFailures?: number;
  readonly sourceDeleteFailures?: number;
  readonly resourcesExist?: boolean;
};
type PricingSave = { readonly sourceSiteId: number; readonly sourceGroupId: string; readonly targetGroupIds: readonly number[] };
