import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import * as httpClient from "../src/adapters/http-client.ts";

const PROJECT_ROOT = new URL("../", import.meta.url);
const APP_SECRET = "settings-secret-with-at-least-24-characters";

async function loadSettingsModules() {
  const paths = [
    "src/server/crypto.ts",
    "src/server/settings/service.ts",
    "src/server/settings/store.ts",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
  const [crypto, service, store] = await Promise.all([
    import("../src/server/crypto.ts"),
    import("../src/server/settings/service.ts"),
    import("../src/server/settings/store.ts"),
  ]);
  return { crypto, service, store };
}

async function withTempDatabase<T>(task: (databaseUrl: string, databasePath: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "s2a-rate-settings-"));
  const databasePath = join(directory, "app.db");
  try {
    return await task(`file:${databasePath}`, databasePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function settingsInput() {
  return {
    target: { name: "Main", baseUrl: "https://target.example.com", adminApiKey: "target-admin-secret", rechargeRatio: 1 },
    proxy: { enabled: true, proxyUrl: "http://127.0.0.1:7890" },
    worker: { intervalSeconds: 600, timeoutSeconds: 25, concurrency: 3 },
    telegram: { botToken: "123456:telegram-test-token", chatId: "-1001234567890",
      hourlyBalanceEnabled: true, rateChangeEnabled: true },
  } as const;
}

test("settings service encrypts target and Telegram credentials at rest", async () => {
  await withTempDatabase(async (databaseUrl, databasePath) => {
    const modules = await loadSettingsModules();
    const store = modules.store.createSqliteSettingsStore(databaseUrl);
    const service = modules.service.createSettingsService({
      store,
      cipher: modules.crypto.createAesGcmSecretCipher(APP_SECRET),
    });
    try {
      await service.save(settingsInput());
      assert.deepEqual(await service.get(), settingsInput());
    } finally {
      store.close();
    }

    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT target_admin_key_enc, telegram_bot_token_enc, notification_channels_enc FROM app_settings WHERE id = 1").get() as {
      target_admin_key_enc: string; telegram_bot_token_enc: string; notification_channels_enc: string;
    };
    database.close();
    assert.notEqual(row.target_admin_key_enc, "target-admin-secret");
    assert.match(row.target_admin_key_enc, /^enc:v1:/);
    assert.notEqual(row.telegram_bot_token_enc, settingsInput().telegram.botToken);
    assert.match(row.telegram_bot_token_enc, /^enc:v1:/);
    assert.equal(row.notification_channels_enc, "");
  });
});

test("notification channels round-trip with encrypted credentials and legacy Telegram fallback", async () => {
  await withTempDatabase(async (databaseUrl) => {
    const modules = await loadSettingsModules();
    const store = modules.store.createSqliteSettingsStore(databaseUrl);
    const service = modules.service.createSettingsService({ store, cipher: modules.crypto.createAesGcmSecretCipher(APP_SECRET) });
    await service.save(settingsInput());
    const saved = await service.saveNotificationChannels?.({
      dingtalk: [{ id: "ding", name: "Ding", enabled: true, webhook: "https://example.test/hook", secret: "signing-secret" }],
      wecom: [], qq: [], feishu: [], telegram: [],
    });
    assert.equal(saved?.dingtalk[0]?.webhook, "https://example.test/hook");
    assert.equal((await service.getNotificationChannels?.())?.dingtalk[0]?.secret, "signing-secret");
    assert.equal((await service.getNotificationChannels?.())?.telegram.length, 0);
    store.close();
  });
});

test("existing settings database gains a target recharge ratio without losing data", async () => {
  await withTempDatabase(async (databaseUrl, databasePath) => {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      INSERT INTO schema_meta VALUES ('schema_version', '10');
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), target_name TEXT NOT NULL,
        target_base_url TEXT NOT NULL, target_admin_key_enc TEXT NOT NULL,
        proxy_enabled INTEGER NOT NULL, proxy_url TEXT NOT NULL,
        worker_interval_seconds INTEGER NOT NULL, worker_timeout_seconds INTEGER NOT NULL,
        worker_concurrency INTEGER NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO app_settings VALUES (1, 'Existing', 'https://existing.example.com',
        'encrypted', 0, '', 600, 25, 3, '2026-01-01T00:00:00.000Z');
    `);
    database.close();

    const modules = await loadSettingsModules();
    const store = modules.store.createSqliteSettingsStore(databaseUrl);
    try {
      const stored = await store.get();
      assert.equal(stored?.targetName, "Existing");
      assert.equal(stored?.targetRechargeRatio, 1);
    } finally {
      store.close();
    }
  });
});

test("enabled proxy requires an explicit proxy URL", async () => {
  await withTempDatabase(async (databaseUrl) => {
    const modules = await loadSettingsModules();
    const store = modules.store.createSqliteSettingsStore(databaseUrl);
    const service = modules.service.createSettingsService({
      store,
      cipher: modules.crypto.createAesGcmSecretCipher(APP_SECRET),
    });
    const input = { ...settingsInput(), proxy: { enabled: true, proxyUrl: "" } };

    await assert.rejects(service.save(input), /启用代理时必须填写代理地址/);
    store.close();
  });
});

test("worker configuration rejects non-positive scheduling values", async () => {
  await withTempDatabase(async (databaseUrl) => {
    const modules = await loadSettingsModules();
    const store = modules.store.createSqliteSettingsStore(databaseUrl);
    const service = modules.service.createSettingsService({
      store,
      cipher: modules.crypto.createAesGcmSecretCipher(APP_SECRET),
    });
    const input = { ...settingsInput(), worker: { intervalSeconds: 0, timeoutSeconds: 0, concurrency: 0 } };

    await assert.rejects(service.save(input));
    store.close();
  });
});

test("shared HTTP client applies the configured request timeout", async () => {
  assert.equal(typeof httpClient.createJsonHttpClient, "function");
  const server = createServer((_request, response) => {
    setTimeout(() => response.end(JSON.stringify({ ok: true })), 80);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try {
    const client = httpClient.createJsonHttpClient({ timeoutMs: 10, proxyUrl: null });
    await assert.rejects(
      client.request({ url: `http://127.0.0.1:${address.port}`, method: "GET", headers: {} }),
      /abort|timeout/i,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("settings API, target test API, and settings form are present", () => {
  const paths = [
    "src/app/api/settings/route.ts",
    "src/app/api/settings/test-target/route.ts",
    "src/app/api/settings/test-telegram/route.ts",
    "src/components/settings-dialog.tsx",
    "src/components/settings-form.tsx",
    "src/components/settings-navigation.tsx",
    "src/components/worker-status-panel.tsx",
  ];
  for (const path of paths) {
    assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  }
  const form = readFileSync(new URL("src/components/settings-form.tsx", PROJECT_ROOT), "utf8");
  const navigation = readFileSync(new URL("src/components/settings-navigation.tsx", PROJECT_ROOT), "utf8");
  const targetTest = readFileSync(new URL("src/app/api/settings/test-target/route.ts", PROJECT_ROOT), "utf8");
  const telegramTest = readFileSync(new URL("src/app/api/settings/test-telegram/route.ts", PROJECT_ROOT), "utf8");
  const dialog = readFileSync(new URL("src/components/settings-dialog.tsx", PROJECT_ROOT), "utf8");
  const status = readFileSync(new URL("src/components/worker-status-panel.tsx", PROJECT_ROOT), "utf8");
  assert.match(dialog, /SettingsForm/);
  assert.match(dialog, /打开全局配置/);
  assert.match(dialog, /h-\[min\(760px,92dvh\)\]/);
  assert.match(form, /presentation/);
  assert.match(form, /WorkerStatusPanel/);
  assert.match(form, /targetRechargeRatio/);
  assert.match(form, /充值倍率/);
  assert.match(form, /TelegramSettingsFields/);
  assert.match(form, /SettingsNavigation/);
  assert.match(navigation, /全局配置分类/);
  assert.match(navigation, /aria-current/);
  assert.match(navigation, /sm:grid-cols-4/);
  assert.match(targetTest, /refreshAll/);
  assert.match(targetTest, /已同步/);
  assert.match(telegramTest, /Telegram 测试消息已发送/);
  assert.match(status, /\/api\/worker\/status/);
  assert.match(status, /最近运行/);
  assert.match(status, /collectedSources/);
});
