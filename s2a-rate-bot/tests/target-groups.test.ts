import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

async function loadModules() {
  const paths = ["src/server/target-groups/service.ts", "src/server/target-groups/store.ts", "src/server/target-groups/client.ts"];
  for (const path of paths) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
  const [service, store] = await Promise.all([
    import("../src/server/target-groups/service.ts"),
    import("../src/server/target-groups/store.ts"),
  ]);
  return { service, store };
}

async function withTargetService<T>(task: (context: Awaited<ReturnType<typeof targetContext>>) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-target-groups-"));
  const context = await targetContext(`file:${join(directory, "app.db")}`);
  try {
    return await task(context);
  } finally {
    context.store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function targetContext(databaseUrl: string) {
  const modules = await loadModules();
  let groups = [{ id: 7, name: "Target VIP", platform: "anthropic", status: "active", rate_multiplier: 1 }];
  const updates: Array<{ groupId: number; rate: number }> = [];
  let listCalls = 0;
  let listError: Error | null = null;
  const client = {
    listGroups: async () => {
      listCalls += 1;
      if (listError) throw listError;
      return groups;
    },
    updateGroupRate: async (groupId: number, rate: number) => {
      updates.push({ groupId, rate });
      groups = groups.map((group) => group.id === groupId ? { ...group, rate_multiplier: rate } : group);
      return groups.find((group) => group.id === groupId)!;
    },
  };
  const store = modules.store.createSqliteTargetGroupStore(databaseUrl);
  seedSourceSites(databaseUrl);
  const sourceRates = async () => [
    { sourceSiteId: 1, groupId: "vip", groupName: "VIP", platform: "anthropic", rawRate: 2, effectiveRate: 2, collectedAt: new Date() },
    { sourceSiteId: 2, groupId: "pro", groupName: "Pro", platform: "openai", rawRate: 4, effectiveRate: 4, collectedAt: new Date() },
  ];
  const service = modules.service.createTargetGroupService({ store, client, sourceRates });
  return {
    ...modules, store, service, updates, databaseUrl,
    setGroups: (value: typeof groups) => { groups = value; },
    setListError: (value: Error | null) => { listError = value; },
    listCalls: () => listCalls,
  };
}

function seedSourceSites(databaseUrl: string) {
  const database = new DatabaseSync(databaseUrl.slice("file:".length));
  const statement = database.prepare(`INSERT INTO collection_sites (
    id, name, site_type, base_url, auth_mode, username, password_enc, access_token_enc,
    refresh_token_enc, recharge_ratio, interval_seconds, use_proxy, enabled, created_at, updated_at
  ) VALUES (?, ?, 'sub2api', 'https://source.example.com', 'manual_token', '', '', '', '', 1, 600, 0, 1, ?, ?)`);
  const now = new Date().toISOString();
  statement.run(1, "Source 1", now, now);
  statement.run(2, "Source 2", now, now);
  database.close();
}

function ruleInput() {
  return {
    enabled: true,
    ruleVersion: 2,
    ruleType: "average",
    parameters: { adjustmentMode: "fixed", adjustmentValue: 0.1, minimum: 2.5, formula: "avg" },
    bindings: [
      { sourceSiteId: 1, sourceGroupId: "vip" },
      { sourceSiteId: 2, sourceGroupId: "pro" },
    ],
  } as const;
}

test("target group page reads SQLite until an explicit remote refresh", async () => {
  await withTargetService(async ({ service, setGroups, listCalls }) => {
    assert.deepEqual(await service.list(), []);
    assert.equal(listCalls(), 0);
    assert.equal((await service.refreshAll())[0].name, "Target VIP");
    setGroups([{ id: 7, name: "Remote Renamed", platform: "anthropic", status: "active", rate_multiplier: 1 }]);

    assert.equal((await service.list())[0].name, "Target VIP");
    assert.equal((await service.list())[0].platform, "anthropic");
    assert.equal((await service.refresh(7))?.name, "Remote Renamed");
    assert.equal(listCalls(), 2);
  });
});
test("failed target group API refresh preserves the last persisted snapshot", async () => {
  await withTargetService(async ({ service, setListError }) => {
    await service.refreshAll();
    setListError(new Error("invalid remote group payload"));

    await assert.rejects(service.refreshAll(), /invalid remote group payload/);
    assert.equal((await service.list())[0]?.name, "Target VIP");
  });
});

test("refresh removes local rules and bindings for target groups deleted remotely", async () => {
  await withTargetService(async ({ service, setGroups, store }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());
    setGroups([]);

    assert.deepEqual(await service.refreshAll(), []);
    assert.equal(store.getGroup(7), null);
    assert.equal(store.getRule(7), null);
    assert.deepEqual(store.bindings(7), []);
  });
});

test("single group refresh removes a group deleted remotely", async () => {
  await withTargetService(async ({ service, setGroups, store }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());
    setGroups([]);

    assert.equal(await service.refresh(7), null);
    assert.equal(store.getGroup(7), null);
    assert.equal(store.getRule(7), null);
    assert.deepEqual(store.bindings(7), []);
  });
});

test("target group client rejects malformed API data instead of treating it as empty", async () => {
  const { createSub2TargetGroupClient } = await import("../src/server/target-groups/client.ts");
  const client = createSub2TargetGroupClient({
    baseUrl: "https://target.example.com",
    adminApiKey: "key",
    http: { request: async <T>() => ({ data: { invalid: true } }) as T },
  });

  await assert.rejects(client.listGroups(), /目标站分组列表响应无效/);
});

test("versioned rule and independent source bindings persist with the target group", async () => {
  await withTargetService(async ({ service }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());

    const [group] = await service.list();
    assert.equal(group.rule.ruleVersion, 2);
    assert.equal(group.rule.ruleType, "average");
    assert.equal(group.rule.parameters.minimum, 2.5);
    assert.deepEqual(group.bindings, ruleInput().bindings);
  });
});

test("preview and apply use bound collected rates and update only when changed", async () => {
  await withTargetService(async ({ service, updates }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());

    const preview = await service.preview(7);
    assert.equal(preview.action, "update");
    assert.equal(preview.nextRate, 3.1);
    const applied = await service.apply(7);
    assert.equal(applied.action, "update");
    assert.deepEqual(updates, [{ groupId: 7, rate: 3.1 }]);
    const [updatedGroup] = await service.list();
    assert.equal(updatedGroup.rule.lastAppliedFromRate, 1);
    assert.equal(updatedGroup.rule.lastAppliedToRate, 3.1);

    const unchanged = await service.apply(7);
    assert.equal(unchanged.action, "skip");
    assert.equal(updates.length, 1);
  });
});

test("save removes missing bindings and disables a rule when none remain", async () => {
  await withTargetService(async ({ service }) => {
    await assert.rejects(service.saveRule(7, { ...ruleInput(), ruleVersion: 1 }), /不支持的倍率规则版本/);
    await service.refreshAll();
    const partial = await service.saveRule(7, { ...ruleInput(), bindings: [
      { sourceSiteId: 1, sourceGroupId: "vip" },
      { sourceSiteId: 1, sourceGroupId: "missing" },
    ] });
    assert.equal(partial.rule.enabled, true);
    assert.deepEqual(partial.bindings, [{ sourceSiteId: 1, sourceGroupId: "vip" }]);

    const empty = await service.saveRule(7, { ...ruleInput(), bindings: [{ sourceSiteId: 1, sourceGroupId: "missing" }] });
    assert.equal(empty.rule.enabled, false);
    assert.deepEqual(empty.bindings, []);
    assert.match(empty.rule.lastError ?? "", /自动取消绑定/);
    assert.equal((await service.preview(7)).action, "skip");
  });
});

test("source rate bindings update target groups without replacing rule settings", async () => {
  await withTargetService(async ({ service }) => {
    await service.refreshAll();
    const vipBinding = { sourceSiteId: 1, sourceGroupId: "vip" };
    await service.saveRule(7, { ...ruleInput(), bindings: [vipBinding] });

    const [removed] = await service.saveSourceBindings({ ...vipBinding, targetGroupIds: [] });
    assert.deepEqual(removed.bindings, []);
    assert.equal(removed.rule.enabled, false);
    assert.equal(removed.rule.ruleType, "average");
    assert.match(removed.rule.lastError ?? "", /自动停用/);

    const [restored] = await service.saveSourceBindings({ ...vipBinding, targetGroupIds: [7] });
    assert.deepEqual(restored.bindings, [vipBinding]);
    assert.equal(restored.rule.enabled, false, "adding a binding must not implicitly enable its rule");
    assert.equal(restored.rule.lastError, null);
    await assert.rejects(
      service.saveSourceBindings({ sourceSiteId: 1, sourceGroupId: "missing", targetGroupIds: [7] }),
      /采集分组不存在/,
    );
  });
});

test("version one fixed offsets migrate explicitly to version two adjustments", async () => {
  await withTargetService(async ({ service, databaseUrl }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());
    const database = new DatabaseSync(databaseUrl.slice("file:".length));
    database.prepare("UPDATE target_group_rules SET rule_version = 1, parameters_json = ? WHERE group_id = 7")
      .run(JSON.stringify({ offset: -0.25, minimum: 0, formula: "avg" }));
    database.close();
    const migrated = (await import("../src/server/target-groups/store.ts"))
      .createSqliteTargetGroupStore(databaseUrl);
    try {
      assert.equal(migrated.getRule(7)?.ruleVersion, 2);
      assert.deepEqual(migrated.getRule(7)?.parameters, {
        adjustmentMode: "fixed", adjustmentValue: -0.25, minimum: 0, formula: "avg",
      });
    } finally { migrated.close(); }
  });
});

test("preview repairs stale bindings stored before cleanup", async () => {
  await withTargetService(async ({ service, store }) => {
    await service.refreshAll();
    await service.saveRule(7, ruleInput());
    store.saveRule(store.getRule(7)!, [{ sourceSiteId: 1, sourceGroupId: "missing" }]);

    assert.equal((await service.preview(7)).action, "skip");
    assert.deepEqual(store.bindings(7), []);
    assert.equal(store.getRule(7)?.enabled, false);
    assert.match(store.getRule(7)?.lastError ?? "", /自动取消绑定/);
  });
});

test("invalid calculation minimum fails API validation explicitly", async () => {
  await withTargetService(async ({ service }) => {
    await assert.rejects(service.saveRule(7, { ...ruleInput(), parameters: { ...ruleInput().parameters, minimum: -1 } }), /计算最小值必须大于或等于 0/);
    await assert.rejects(service.saveRule(7, { ...ruleInput(), parameters: { ...ruleInput().parameters, minimum: Number.NaN } }), /计算最小值必须是有效数字/);
  });
});
