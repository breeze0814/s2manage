import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

function projectPath(path: string) {
  return new URL(path, ROOT);
}

function source(path: string) {
  const file = projectPath(path);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

test("package exposes a Next.js application toolchain", () => {
  const pkg = JSON.parse(source("package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  assert.equal(pkg.scripts?.dev, "next dev -p 18074");
  assert.equal(pkg.scripts?.build, "next build");
  assert.equal(pkg.scripts?.start, "next start -p 18074");
  assert.ok(pkg.dependencies?.next);
  assert.ok(pkg.dependencies?.react);
  assert.ok(pkg.dependencies?.["react-dom"]);
});

test("App Router contains the four approved top-level pages", () => {
  const pages = [
    "src/app/groups/page.tsx",
    "src/app/sources/page.tsx",
    "src/app/accounts/page.tsx",
    "src/app/settings/page.tsx",
  ];

  for (const page of pages) {
    assert.equal(existsSync(projectPath(page)), true, `${page} should exist`);
  }
});

test("application shell uses route-backed top navigation", () => {
  const shell = source("src/components/app-shell.tsx");

  assert.match(shell, /usePathname/);
  assert.match(shell, /href:\s*"\/groups"/);
  assert.match(shell, /href:\s*"\/sources"/);
  assert.match(shell, /href:\s*"\/accounts"/);
  assert.match(shell, /href:\s*"\/settings"/);
  assert.match(shell, /分组倍率/);
  assert.match(shell, /倍率采集/);
  assert.match(shell, /账号调度/);
  assert.match(shell, /全局配置/);
});

test("root layout mounts the application shell and global styles", () => {
  const layout = source("src/app/layout.tsx");

  assert.match(layout, /import "\.\/globals\.css"/);
  assert.match(layout, /AppShell/);
  assert.match(layout, /lang="zh-CN"/);
});

test("responsive shell avoids horizontal page overflow", () => {
  const styles = source("src/app/globals.css");
  const shell = source("src/components/app-shell.tsx");

  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(shell, /grid-cols-2/);
  assert.match(shell, /md:grid-cols-4/);
});

test("warm stone themes expose semantic tokens before hydration", () => {
  const styles = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");
  const layout = source("src/app/layout.tsx");

  assert.match(styles, /--background:\s*240 235 227/);
  assert.match(styles, /\.dark\s*\{[\s\S]*--background:\s*12 10 9/);
  assert.match(styles, /--primary:\s*249 156 0/);
  assert.match(tailwind, /surface:\s*"rgb\(var\(--surface\) \/ <alpha-value>\)"/);
  assert.match(layout, /localStorage\.getItem\("s2a-rate-theme"\)/);
  assert.match(layout, /prefers-color-scheme:\s*dark/);
});

test("application shell exposes an accessible persisted theme toggle", () => {
  const shell = source("src/components/app-shell.tsx");
  const toggle = source("src/components/theme-toggle.tsx");

  assert.match(shell, /ThemeToggle/);
  assert.match(toggle, /aria-label="切换明暗主题"/);
  assert.match(toggle, /localStorage\.setItem\(THEME_KEY/);
  assert.match(toggle, /document\.documentElement\.classList\.toggle\("dark"/);
  assert.match(toggle, /Sun/);
  assert.match(toggle, /Moon/);
});

test("components use semantic theme colors instead of slate utilities", () => {
  const paths = [
    "src/components/app-shell.tsx",
    "src/components/auth-dialog.tsx",
    "src/components/settings-form.tsx",
    "src/components/worker-status-panel.tsx",
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/groups/group-rule-card.tsx",
    "src/components/groups/groups-dashboard.tsx",
    "src/components/sources/source-rates-table.tsx",
    "src/components/sources/source-site-dialog.tsx",
    "src/components/sources/source-site-table.tsx",
    "src/components/sources/sources-dashboard.tsx",
  ];
  const components = paths.map(source).join("\n");

  assert.doesNotMatch(components, /(?:bg|text|border|ring)-slate-/);
  assert.match(components, /bg-surface/);
  assert.match(components, /text-muted/);
  assert.match(components, /border-border/);
});

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

test("development and production builds use isolated Next.js output directories", () => {
  const config = source("next.config.mjs");
  const ignore = source(".gitignore");

  assert.match(config, /process\.env\.NODE_ENV === "development"/);
  assert.match(config, /distDir:\s*development \? "\.next-dev" : "\.next"/);
  assert.match(ignore, /\.next-dev\//);
});
