import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = new URL("../", import.meta.url);

test("target account runtime replaces a legacy cached service after hot reload", async () => {
  const script = `
    const legacy = { list: async () => [], refresh: async () => [] };
    globalThis.s2aTargetAccountService = legacy;
    globalThis.s2aInfrastructure = {
      postgres: { pool: {}, ready: Promise.resolve() },
      redis: { client: {}, ready: Promise.resolve({}), close: async () => {} },
      status: async () => ({ postgres: "ready", redis: "ready" }),
      close: async () => {},
    };
    const runtime = await import("./src/server/target-accounts/runtime.ts");
    const service = runtime.getRuntimeTargetAccountService();
    if (service === legacy) throw new Error("legacy target account service was reused");
    if (typeof service.saveBinding !== "function") throw new Error("saveBinding is unavailable");
  `;
  const result = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: ROOT,
    env: { ...process.env, APP_SECRET: "target-account-runtime-test-secret" },
    timeout: 10_000,
  });
  assert.equal(result.stderr, "");
});
