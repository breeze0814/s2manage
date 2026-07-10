import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  let groups = [{ id: 7, name: "Target VIP", status: "active", rate_multiplier: 1 }];
  const updates: Array<{ groupId: number; rate: number }> = [];
  let listCalls = 0;
  const client = {
    listGroups: async () => { listCalls += 1; return groups; },
    updateGroupRate: async (groupId: number, rate: number) => {
      updates.push({ groupId, rate });
      groups = groups.map((group) => group.id === groupId ? { ...group, rate_multiplier: rate } : group);
      return groups.find((group) => group.id === groupId)!;
    },
  };
  const store = modules.store.createSqliteTargetGroupStore(databaseUrl);
  seedSourceSites(databaseUrl);
  const sourceRates = async () => [
    { sourceSiteId: 1, groupId: "vip", groupName: "VIP", rawRate: 2, effectiveRate: 2, collectedAt: new Date() },
    { sourceSiteId: 2, groupId: "pro", groupName: "Pro", rawRate: 4, effectiveRate: 4, collectedAt: new Date() },
  ];
  const service = modules.service.createTargetGroupService({ store, client, sourceRates });
  return { ...modules, store, service, updates, setGroups: (value: typeof groups) => { groups = value; }, listCalls: () => listCalls };
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
    ruleVersion: 1,
    ruleType: "average",
    parameters: { offset: 0.1, multiplier: 1, formula: "avg" },
    bindings: [
      { sourceSiteId: 1, sourceGroupId: "vip" },
      { sourceSiteId: 2, sourceGroupId: "pro" },
    ],
  } as const;
}

test("target group list is fetched from the remote client on every refresh", async () => {
  await withTargetService(async ({ service, setGroups, listCalls }) => {
    assert.equal((await service.list())[0].name, "Target VIP");
    setGroups([{ id: 7, name: "Remote Renamed", status: "active", rate_multiplier: 1 }]);

    assert.equal((await service.list())[0].name, "Remote Renamed");
    assert.equal(listCalls(), 2);
  });
});

test("versioned rule and independent source bindings persist with the target group", async () => {
  await withTargetService(async ({ service }) => {
    await service.saveRule(7, ruleInput());

    const [group] = await service.list();
    assert.equal(group.rule.ruleVersion, 1);
    assert.equal(group.rule.ruleType, "average");
    assert.deepEqual(group.bindings, ruleInput().bindings);
  });
});

test("preview and apply use bound collected rates and update only when changed", async () => {
  await withTargetService(async ({ service, updates }) => {
    await service.saveRule(7, ruleInput());

    const preview = await service.preview(7);
    assert.equal(preview.action, "update");
    assert.equal(preview.nextRate, 3.1);
    const applied = await service.apply(7);
    assert.equal(applied.action, "update");
    assert.deepEqual(updates, [{ groupId: 7, rate: 3.1 }]);

    const unchanged = await service.apply(7);
    assert.equal(unchanged.action, "skip");
    assert.equal(updates.length, 1);
  });
});

test("unsupported rule versions and missing bindings fail explicitly", async () => {
  await withTargetService(async ({ service }) => {
    await assert.rejects(service.saveRule(7, { ...ruleInput(), ruleVersion: 2 }), /不支持的倍率规则版本/);
    await service.saveRule(7, { ...ruleInput(), bindings: [{ sourceSiteId: 1, sourceGroupId: "missing" }] });
    await assert.rejects(service.preview(7), /采集源分组不存在/);
  });
});

test("target group routes and dashboard expose remote refresh, rule version and bindings", () => {
  const paths = [
    "src/app/api/groups/route.ts",
    "src/app/api/groups/[id]/rule/route.ts",
    "src/app/api/groups/[id]/preview/route.ts",
    "src/app/api/groups/[id]/apply/route.ts",
    "src/components/groups/groups-dashboard.tsx",
  ];
  for (const path of paths) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
  const dashboard = readFileSync(new URL("src/components/groups/groups-dashboard.tsx", ROOT), "utf8");
  assert.match(dashboard, /刷新目标站分组/);
  assert.match(dashboard, /ruleVersion/);
  assert.match(dashboard, /sourceGroupId/);
});
