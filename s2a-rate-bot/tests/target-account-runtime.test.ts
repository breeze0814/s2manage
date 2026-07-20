import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = new URL("../", import.meta.url);

test("target account runtime replaces a legacy cached service after hot reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-account-runtime-"));
  const script = `
    const legacy = { list: async () => [], refresh: async () => [] };
    globalThis.s2aTargetAccountService = legacy;
    const runtime = await import("./src/server/target-accounts/runtime.ts");
    const service = runtime.getRuntimeTargetAccountService();
    if (service === legacy) throw new Error("legacy target account service was reused");
    if (typeof service.saveBinding !== "function") throw new Error("saveBinding is unavailable");
  `;
  try {
    const result = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: ROOT,
      env: {
        ...process.env,
        APP_SECRET: "target-account-runtime-test-secret",
        DATABASE_URL: `file:${join(directory, "app.db")}`,
      },
      timeout: 10_000,
    });
    assert.equal(result.stderr, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
