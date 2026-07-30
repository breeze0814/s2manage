import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const SOURCE = fileURLToPath(new URL("src/", ROOT));

test("business components use the shadcn layer instead of native browser controls", () => {
  const consumers = componentFiles(SOURCE)
    .filter((file) => !relative(SOURCE, file).startsWith(join("components", "ui")))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(consumers, /<(?:button|input|select|textarea|table|label)\b/);
  assert.doesNotMatch(consumers, /@radix-ui\/react-/);
});

test("shadcn primitives own browser controls and Radix integrations", () => {
  const primitives = ["button", "checkbox", "context-menu", "dialog", "input", "label", "radio-group", "select", "switch", "table", "textarea"];
  for (const primitive of primitives) {
    const source = readFileSync(new URL(`src/components/ui/${primitive}.tsx`, ROOT), "utf8");
    assert.ok(source.length > 0, `${primitive} primitive should exist`);
  }
  assert.match(readFileSync(new URL("src/components/ui/button.tsx", ROOT), "utf8"), /class-variance-authority/);
  assert.match(readFileSync(new URL("src/components/ui/dialog.tsx", ROOT), "utf8"), /@radix-ui\/react-dialog/);
});

function componentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return componentFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}
