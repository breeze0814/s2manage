import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);
const APP_SECRET = "collection-secret-with-at-least-24-characters";

async function loadModules() {
  const paths = [
    "src/server/collection/service.ts",
    "src/server/collection/store.ts",
    "src/server/collection/collector.ts",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
  const [crypto, service, store] = await Promise.all([
    import("../src/server/crypto.ts"),
    import("../src/server/collection/service.ts"),
    import("../src/server/collection/store.ts"),
  ]);
  return { crypto, service, store };
}

async function withCollection<T>(collector: CollectionCollector, task: (context: Awaited<ReturnType<typeof createContext>>) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-collection-"));
  const databasePath = join(directory, "app.db");
  const context = await createContext(`file:${databasePath}`, databasePath, collector);
  try {
    return await task(context);
  } finally {
    context.store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function createContext(databaseUrl: string, databasePath: string, collector: CollectionCollector) {
  const modules = await loadModules();
  const store = modules.store.createSqliteCollectionStore(databaseUrl);
  const service = modules.service.createCollectionService({
    store,
    cipher: modules.crypto.createAesGcmSecretCipher(APP_SECRET),
    collector,
    requestOptions: async () => ({ timeoutMs: 25_000, proxyUrl: null }),
  });
  return { ...modules, store, service, databasePath };
}

function sourceInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Sub2 Source",
    siteType: "sub2api",
    baseUrl: "https://source.example.com",
    authMode: "password",
    username: "user@example.com",
    password: "source-password",
    accessToken: "",
    refreshToken: "",
    rechargeRatio: 1,
    intervalSeconds: 600,
    useProxy: true,
    enabled: true,
    ...overrides,
  };
}

test("collection site CRUD encrypts credentials and never returns their values", async () => {
  await withCollection(successCollector(), async ({ service, databasePath }) => {
    const created = await service.create(sourceInput());
    assert.equal(created.name, "Sub2 Source");
    assert.equal(created.hasPassword, true);
    assert.equal("password" in created, false);

    const updated = await service.update(created.id, { ...sourceInput(), name: "Updated", enabled: false, password: "" });
    assert.equal(updated.name, "Updated");
    assert.equal(updated.enabled, false);
    assert.equal(updated.hasPassword, true, "blank password should preserve the stored credential");
    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT password_enc FROM collection_sites WHERE id = ?").get(created.id) as { password_enc: string };
    database.close();
    assert.match(row.password_enc, /^enc:v1:/);
    assert.doesNotMatch(row.password_enc, /source-password/);
  });
});

test("successful refresh persists balance, rates, and a success run", async () => {
  await withCollection(successCollector(), async ({ service }) => {
    const site = await service.create(sourceInput());

    const refreshed = await service.refresh(site.id);
    const rates = await service.rates(site.id);

    assert.equal(refreshed.lastStatus, "success");
    assert.equal(refreshed.accountLabel, "source@example.com");
    assert.equal(refreshed.balance, 12.5);
    assert.equal(refreshed.consecutiveFailures, 0);
    assert.deepEqual(rates.map((rate: { groupId: string; effectiveRate: number }) => [rate.groupId, rate.effectiveRate]), [["vip", 2]]);
  });
});

test("failed refresh records the error and increments consecutive failures", async () => {
  await withCollection({ collect: async () => { throw new Error("remote unavailable"); } }, async ({ service }) => {
    const site = await service.create(sourceInput());

    await assert.rejects(service.refresh(site.id), /remote unavailable/);
    const [failed] = await service.list();
    assert.equal(failed.lastStatus, "failed");
    assert.equal(failed.lastError, "remote unavailable");
    assert.equal(failed.consecutiveFailures, 1);
  });
});

test("refresh all reports each enabled site result without hiding failures", async () => {
  const collector: CollectionCollector = {
    collect: async ({ site }) => {
      if (site.siteType === "newapi") throw new Error("newapi failed");
      return successOverview(site.id);
    },
  };
  await withCollection(collector, async ({ service }) => {
    await service.create(sourceInput());
    await service.create(sourceInput({ name: "New API", siteType: "newapi", authMode: "manual_token", accessToken: "token" }));
    await service.create(sourceInput({ name: "Disabled", enabled: false }));

    const results = await service.refreshAll();

    assert.deepEqual(results.map((result: { ok: boolean }) => result.ok), [true, false]);
    assert.match(results[1].error ?? "", /newapi failed/);
  });
});

test("collection API routes are present", () => {
  const paths = [
    "src/app/api/sources/route.ts",
    "src/app/api/sources/[id]/route.ts",
    "src/app/api/sources/[id]/refresh/route.ts",
    "src/app/api/sources/refresh-all/route.ts",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
});

function successCollector(): CollectionCollector {
  return { collect: async ({ site }) => successOverview(site.id) };
}

function successOverview(siteId: number) {
  return {
    account: { sourceSiteId: siteId, label: "source@example.com", balance: 12.5 },
    rates: [{ sourceSiteId: siteId, groupId: "vip", groupName: "VIP", platform: "openai", rawRate: 2, effectiveRate: 2, collectedAt: new Date() }],
  };
}

type CollectionCollector = {
  readonly collect: (input: { site: { id: number; siteType: string } }) => Promise<ReturnType<typeof successOverview>>;
};
