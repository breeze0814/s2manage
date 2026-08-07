import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);

test("collection API routes are present", () => {
  const paths = [
    "src/app/api/sources/route.ts",
    "src/app/api/sources/[id]/route.ts",
    "src/app/api/sources/[id]/refresh/route.ts",
    "src/app/api/sources/[id]/channel-monitors/route.ts",
    "src/app/api/sources/refresh-all/route.ts",
    "src/app/api/sources/refresh-stream/route.ts",
    "src/app/api/sources/changes/route.ts",
    "src/app/api/sources/runs/route.ts",
    "src/app/api/sources/rates/bindings/route.ts",
  ];
  for (const path of paths) assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
});

test("ticket embed session has an explicit POST route ahead of the ticket id route", async () => {
  const path = "src/app/api/embed/tickets/session/route.ts";
  assert.equal(existsSync(new URL(path, PROJECT_ROOT)), true, `${path} should exist`);
  const route = await import("../src/app/api/embed/tickets/session/route.ts");
  assert.equal(typeof route.POST, "function");
});
