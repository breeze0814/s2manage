import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

test("subproject owns its ESLint configuration", () => {
  const configSource = source(".eslintrc.json");
  const config = JSON.parse(configSource) as { root?: boolean };
  assert.match(configSource, /next\/core-web-vitals/);
  assert.equal(config.root, true);
});

test("subproject ignores generated Next.js and dependency artifacts", () => {
  const ignore = source(".gitignore");
  assert.match(ignore, /node_modules\//);
  assert.match(ignore, /\.next\//);
  assert.match(ignore, /data\/\*\.db/);
});

test("forms use compact semantic number controls and lists share tag styling", () => {
  const compactInput = source("src/components/ui/compact-number-input.tsx");
  const tag = source("src/components/ui/tag.tsx");
  const forms = [
    "src/components/settings-form.tsx",
    "src/components/sources/source-site-dialog.tsx",
    "src/components/groups/group-rule-fields.tsx",
  ].map(source).join("\n");
  for (const pattern of [/sm:w-\[7ch\]/, /sm:w-\[9ch\]/, /sm:w-\[11ch\]/, /sm:w-fit/, /border-l border-border/, /text-base/, /sm:text-sm/, /tabular-nums/]) {
    assert.match(compactInput, pattern);
  }
  assert.match(forms, /CompactNumberInput/);
  assert.match(forms, /suffix="秒"/);
  assert.match(forms, /suffix="倍"/);
  for (const pattern of [/TagTone/, /whitespace-nowrap/, /overflow-hidden/, /text-xs/, /rounded-md border/]) {
    assert.match(tag, pattern);
  }
  assert.match(source("src/app/globals.css"), /text-base[\s\S]*sm:text-sm/);
});

test("development and production builds use isolated Next.js output directories", () => {
  const config = source("next.config.mjs");
  const ignore = source(".gitignore");
  assert.match(config, /process\.env\.NODE_ENV === "development"/);
  assert.match(config, /distDir:\s*development \? "\.next-dev" : "\.next"/);
  assert.match(ignore, /\.next-dev\//);
});
