import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { CompensationRule } from "../src/core/compensation.ts";
import { createSqliteCompensationClaimStore } from "../src/server/compensation/claim-store.ts";
import { createCompensationConfigService } from "../src/server/compensation/config-service.ts";
import type { CompensationConfigStore, StoredCompensationSettings } from "../src/server/compensation/config-store.ts";
import { createJsonOrderGateway } from "../src/server/compensation/json-order-gateway.ts";
import { createCompensationService } from "../src/server/compensation/service.ts";
import type { EmbedIdentity } from "../src/server/embeds/types.ts";
import { ensureEmbedSchema } from "../src/storage/sqlite-embed-schema.ts";

const RULES: readonly CompensationRule[] = [{
  id: "half",
  name: "半额补偿",
  startAt: "2026-07-01T00:00:00.000Z",
  endAt: "2026-08-01T00:00:00.000Z",
  ratePercent: 50,
}];

test("JSON compensation configuration does not require URL credentials", async () => {
  const service = configService();
  const settings = await service.update({
    enabled: true,
    activityName: "JSON 订单补偿",
    description: "",
    orderSource: "json",
    baseUrl: "",
    username: "",
    password: "",
    rules: RULES,
  });
  assert.equal(settings.orderSource, "json");
  assert.equal(settings.passwordConfigured, false);
});

test("JSON compensation source loads once and never calls Liandong HTTP", async () => {
  const claims = createSqliteCompensationClaimStore("file::memory:");
  let reads = 0;
  let liandongCalls = 0;
  const jsonOrders = createJsonOrderGateway({
    path: "memory://ld.json",
    sourceName: "data/ld.json",
    read: async () => { reads += 1; return JSON.stringify(orderPage()); },
  });
  const service = createCompensationService({
    config: await configuredJsonService(),
    claims,
    jsonOrders,
    liandong: {
      login: async () => { liandongCalls += 1; throw new Error("不应登录联动小铺"); },
      findOrder: async () => { liandongCalls += 1; throw new Error("不应请求联动订单接口"); },
    },
    rewards: { generate: async () => [{ id: 43, code: "JSON-500", type: "balance", value: 5 }] },
    id: () => "json-claim",
  });
  try {
    const claim = await service.calculate(identity(), { orders: "LD-1\nLD-404" });
    assert.equal(reads, 1);
    assert.equal(liandongCalls, 0);
    assert.equal(claim.storeName, "data/ld.json");
    assert.deepEqual(claim.results.map((result) => result.status), ["found", "not_found"]);
    assert.deepEqual(await service.testConnection(), {
      source: "json", name: "data/ld.json", orderCount: 1,
    });
    assert.equal(reads, 2);
    assert.equal(liandongCalls, 0);
  } finally { claims.close(); }
});

test("JSON compensation source exposes invalid file content", async () => {
  const unreadable = jsonGateway(async () => { throw new Error("ENOENT"); });
  const invalidJson = jsonGateway(async () => "{invalid");
  const invalidShape = jsonGateway(async () => JSON.stringify({ code: 1, data: {} }));
  await assert.rejects(unreadable.load(), /读取 JSON 订单文件失败.*ENOENT/);
  await assert.rejects(invalidJson.load(), /JSON 订单文件无效.*data\/ld\.json/);
  await assert.rejects(invalidShape.load(), /JSON 订单文件结构无效.*data\.list 不是数组/);
});

test("JSON compensation source accepts the data-only snapshot format", async () => {
  const catalog = await jsonGateway(async () => JSON.stringify({ data: orderPage().data })).load();
  assert.equal(catalog.orderCount, 1);
  assert.equal(catalog.findOrder("LD-1")?.tradeNo, "LD-1");
});

test("legacy compensation settings migrate to URL order lookup", () => {
  const database = new DatabaseSync(":memory:");
  try {
    createLegacySettings(database);
    ensureEmbedSchema(database);
    const row = database.prepare("SELECT order_source FROM embed_compensation_settings WHERE id=1")
      .get() as { order_source: string };
    assert.equal(row.order_source, "url");
  } finally { database.close(); }
});

async function configuredJsonService() {
  const service = configService();
  await service.update({ enabled: true, activityName: "订单补偿", description: "", orderSource: "json",
    baseUrl: "", username: "", password: "", rules: RULES });
  return service;
}

function configService() {
  return createCompensationConfigService({
    store: memoryConfigStore(),
    cipher: { encrypt: (value) => `encrypted:${value}`, decrypt: (value) => value.replace(/^encrypted:/, "") },
  });
}

function memoryConfigStore(): CompensationConfigStore {
  let value: StoredCompensationSettings | null = null;
  return {
    get: () => value,
    save: (settings) => {
      value = { ...settings, updatedAt: "2026-08-05T12:00:00.000Z" };
      return value;
    },
    close: () => undefined,
  };
}

function jsonGateway(read: () => Promise<string>) {
  return createJsonOrderGateway({ path: "memory://ld.json", sourceName: "data/ld.json", read });
}

function createLegacySettings(database: DatabaseSync) {
  database.exec(`CREATE TABLE embed_compensation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL,
    activity_name TEXT NOT NULL, description TEXT NOT NULL, base_url TEXT NOT NULL,
    username TEXT NOT NULL, password_enc TEXT NOT NULL, rules_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`);
  database.prepare("INSERT INTO embed_compensation_settings VALUES (1, 1, ?, '', ?, ?, ?, '[]', ?)")
    .run("旧补偿活动", "https://www.ldxp.cn", "merchant", "encrypted", "now");
}

function identity(): EmbedIdentity {
  return {
    kind: "compensation",
    embedToken: "embed-token",
    srcHost: "https://sub2api.example.com",
    srcUrl: "https://sub2api.example.com/console",
    sub2apiUserId: "user-1",
    sub2apiEmail: "user@example.com",
    sub2apiRole: "user",
    sub2apiBalance: 20,
  };
}

function orderPage() {
  return { code: 1, data: { total: 1, list: [{
    trade_no: "LD-1", goods_name: "测试商品", quantity: 1, total_amount: 10,
    status: 1, create_time: Date.parse("2026-07-20T00:00:00.000Z") / 1_000, success_time: null,
    user_id: 1, sendout: 1, parent_id: 0, parent_amount: 0, identity: "buyer",
    goods: { id: 1, goods_type: "card", goods_key: "key", name: "测试商品", description: "", link: "" },
  }] } };
}
