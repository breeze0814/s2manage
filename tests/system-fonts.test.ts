import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const tailwindSource = readFileSync("tailwind.config.ts", "utf8");

const dedicatedFontPatterns = [
  /next\/font/,
  /font\/google/,
  /\bInter\s*\(/,
  /\bJetBrains_Mono\s*\(/,
  /\bSpace_Grotesk\s*\(/,
  /--font-sans/,
  /--font-display/,
  /--font-mono/,
];

for (const pattern of dedicatedFontPatterns) {
  assert.doesNotMatch(layoutSource, pattern, "Root layout should not load dedicated web fonts");
  assert.doesNotMatch(globalsSource, pattern, "Global CSS should not depend on dedicated font variables");
  assert.doesNotMatch(tailwindSource, pattern, "Tailwind font stacks should not depend on dedicated font variables");
}

assert.match(
  globalsSource,
  /font-family:\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*sans-serif;/,
  "Global body font should use the browser/system sans stack",
);

assert.match(
  tailwindSource,
  /sans:\s*\[\s*"ui-sans-serif",\s*"system-ui",\s*"-apple-system",\s*"BlinkMacSystemFont",\s*"Segoe UI",\s*"sans-serif"\s*\]/,
  "Tailwind sans font family should use the browser/system sans stack",
);

assert.match(
  tailwindSource,
  /mono:\s*\[\s*"ui-monospace",\s*"SFMono-Regular",\s*"Menlo",\s*"Monaco",\s*"Consolas",\s*"Liberation Mono",\s*"monospace"\s*\]/,
  "Tailwind mono font family should use the browser/system mono stack",
);
