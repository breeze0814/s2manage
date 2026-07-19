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
    requestOptions: async () => ({ timeoutMs: 25_000, proxyUrl: null, targetRechargeRatio: 1 }),
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

test("New API token authentication requires an access token", async () => {
  await withCollection(successCollector(), async ({ service }) => {
    await assert.rejects(service.create(sourceInput({
      siteType: "newapi",
      authMode: "manual_token",
      username: "",
      password: "",
      accessToken: "",
      refreshToken: "unsupported-refresh-token",
    })), /New API Token 认证需要 Access Token/);
  });
});

test("successful refresh encrypts API credentials returned by the collector", async () => {
  const collector = {
    collect: async ({ site }: { site: { id: number } }) => ({
      ...successOverview(site.id),
      credentials: { accessToken: "fresh-access-token", refreshToken: "fresh-refresh-token" },
    }),
  };
  await withCollection(collector, async ({ service, databasePath, crypto }) => {
    const site = await service.create(sourceInput());
    await service.refresh(site.id);
    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT access_token_enc, refresh_token_enc FROM collection_sites WHERE id = ?").get(site.id) as { access_token_enc: string; refresh_token_enc: string };
    database.close();
    const cipher = crypto.createAesGcmSecretCipher(APP_SECRET);
    assert.equal(cipher.decrypt(row.access_token_enc), "fresh-access-token");
    assert.equal(cipher.decrypt(row.refresh_token_enc), "fresh-refresh-token");
    assert.doesNotMatch(row.access_token_enc, /fresh-access-token/);
  });
});

test("successful refresh records added updated and deleted group rates", async () => {
  let collection = 0;
  const collector = {
    collect: async ({ site }: { site: { id: number } }) => {
      collection += 1;
      const rates = collection === 1
        ? [sourceRate(site.id, "vip", "VIP", 2), sourceRate(site.id, "legacy", "Legacy", 3)]
        : [sourceRate(site.id, "vip", "VIP", 2.5), sourceRate(site.id, "new", "New", 1.2)];
      return { account: { sourceSiteId: site.id, label: "source@example.com", balance: 12.5 }, rates };
    },
  };
  await withCollection(collector, async ({ service, databasePath }) => {
    const site = await service.create(sourceInput());
    await service.refresh(site.id);
    await service.refresh(site.id);

    const changes = await service.changes();
    assert.deepEqual(changes.slice(0, 3).map((change) => [
      change.groupId, change.changeType, change.oldRate, change.newRate,
    ]), [
      ["legacy", "deleted", 3, null],
      ["new", "added", null, 1.2],
      ["vip", "updated", 2, 2.5],
    ]);
    assert.equal(changes.every((change) => change.sourceSiteName === "Sub2 Source"), true);

    const database = new DatabaseSync(databasePath);
    database.prepare("UPDATE collection_rate_changes SET collected_at = ? WHERE group_id = ?")
      .run("2020-01-01T00:00:00.000Z", "legacy");
    database.close();
    const recent = await service.changes({ since: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString() });
    assert.equal(recent.some((change) => change.groupId === "legacy"), false);
  });
});
test("successful refresh removes bindings for deleted source groups", async () => {
  let collection = 0;
  const collector = {
    collect: async ({ site }: { site: { id: number } }) => ({
      account: { sourceSiteId: site.id, label: "source@example.com", balance: 12.5 },
      rates: ++collection === 1
        ? [sourceRate(site.id, "vip", "VIP", 2), sourceRate(site.id, "legacy", "Legacy", 3)]
        : [sourceRate(site.id, "vip", "VIP", 2.5)],
    }),
  };
  await withCollection(collector, async ({ service, databasePath }) => {
    const site = await service.create(sourceInput());
    await service.refresh(site.id);
    const targetStore = (await import("../src/server/target-groups/store.ts")).createSqliteTargetGroupStore(`file:${databasePath}`);
    try {
      targetStore.saveRule({ targetGroupId: 7, targetGroupName: "Target", enabled: true, ruleVersion: 1,
        ruleType: "average", parameters: { offset: 0, minimum: 0, formula: "avg" },
        currentRate: null, lastAppliedAt: null, lastError: null }, [
        { sourceSiteId: site.id, sourceGroupId: "vip" },
        { sourceSiteId: site.id, sourceGroupId: "legacy" },
      ]);
      targetStore.saveRule({ ...targetStore.getRule(7)!, targetGroupId: 8, targetGroupName: "Orphaned" },
        [{ sourceSiteId: site.id, sourceGroupId: "legacy" }]);
      await service.refresh(site.id);
      assert.deepEqual([targetStore.bindings(7), targetStore.getRule(7)?.enabled, targetStore.bindings(8), targetStore.getRule(8)?.enabled],
        [[{ sourceSiteId: site.id, sourceGroupId: "vip" }], true, [], false]);
      assert.match(targetStore.getRule(8)?.lastError ?? "", /已自动停用/);
    } finally {
      targetStore.close();
    }
  });
});
test("manual group platform overrides persist across refreshes", async () => {
  await withCollection(successCollector(), async ({ service }) => {
    const site = await service.create(sourceInput());
    await service.refresh(site.id);
    const overridden = await service.setRatePlatform(site.id, "vip", "anthropic");
    assert.equal(overridden.platform, "anthropic");
    assert.equal(overridden.platformOverride, "anthropic");

    await service.refresh(site.id);
    assert.equal((await service.rates(site.id))[0]?.platform, "anthropic");
    const automatic = await service.setRatePlatform(site.id, "vip", null);
    assert.equal(automatic.platform, "openai");
    assert.equal(automatic.platformOverride, null);
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

test("failed API refresh preserves the last persisted balance and rates", async () => {
  let shouldFail = false;
  const collector: CollectionCollector = {
    collect: async ({ site }) => {
      if (shouldFail) throw new Error("malformed API response");
      return successOverview(site.id);
    },
  };
  await withCollection(collector, async ({ service }) => {
    const site = await service.create(sourceInput());
    await service.refresh(site.id);
    shouldFail = true;

    await assert.rejects(service.refresh(site.id), /malformed API response/);
    const [stored] = await service.list();
    assert.equal(stored.balance, 12.5);
    assert.deepEqual((await service.rates(site.id)).map((rate) => rate.groupId), ["vip"]);
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
    "src/app/api/sources/changes/route.ts",
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

function sourceRate(siteId: number, groupId: string, groupName: string, effectiveRate: number) {
  return { sourceSiteId: siteId, groupId, groupName, platform: "openai", rawRate: effectiveRate, effectiveRate, collectedAt: new Date() };
}

type CollectionCollector = {
  readonly collect: (input: { site: { id: number; siteType: string } }) => Promise<ReturnType<typeof successOverview>>;
};
