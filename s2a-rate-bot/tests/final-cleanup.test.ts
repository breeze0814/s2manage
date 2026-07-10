import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

test("legacy API, bot, static UI, storage, and Sub2-only worker paths are removed", () => {
  const removed = [
    "ui",
    "src/api",
    "src/bot",
    "src/adapters/sub2api-admin.ts",
    "src/components/page-placeholder.tsx",
    "src/shared/config.ts",
    "src/shared/status.ts",
    "src/storage/app-config.ts",
    "src/storage/schema.ts",
    "src/storage/sqlite-app-storage.ts",
    "src/storage/sqlite-read.ts",
    "src/storage/sqlite-write.ts",
    "src/worker/sub2-cycle.ts",
  ];
  for (const path of removed) assert.equal(existsSync(new URL(path, ROOT)), false, `${path} should be removed`);
});

test("package scripts and dependencies describe only the Next.js app and generic worker", () => {
  const packageJson = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  assert.equal(packageJson.scripts.api, undefined);
  assert.equal(packageJson.scripts.bot, undefined);
  assert.match(packageJson.scripts.worker ?? "", /src\/worker\/main\.ts/);
  for (const dependency of ["@radix-ui/react-label", "@radix-ui/react-slot", "@radix-ui/react-tabs", "class-variance-authority", "clsx", "tailwind-merge"]) {
    assert.equal(packageJson.dependencies[dependency], undefined, `${dependency} should be removed`);
  }
});

test("SQLite schema and deployment documentation contain only the rebuilt runtime", () => {
  const schema = readFileSync(new URL("src/storage/sqlite-schema.ts", ROOT), "utf8");
  const readme = readFileSync(new URL("README.md", ROOT), "utf8");
  const environment = readFileSync(new URL(".env.example", ROOT), "utf8");
  for (const table of ["bot_settings", "source_sites", "source_accounts", "source_rates", "target_accounts", "group_rules"]) {
    assert.doesNotMatch(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(readme, /Next\.js/);
  assert.match(readme, /npm run worker/);
  assert.match(readme, /APP_SECRET/);
  assert.doesNotMatch(readme, /QQBot/);
  assert.match(environment, /^APP_SECRET=/m);
  assert.match(environment, /^DATABASE_URL=file:/m);
});
