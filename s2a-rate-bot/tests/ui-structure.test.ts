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

  assert.equal(pkg.scripts?.dev, "node scripts/start-next.cjs dev");
  assert.equal(pkg.scripts?.build, "next build");
  assert.equal(pkg.scripts?.start, "node scripts/start-next.cjs start");
  assert.ok(pkg.dependencies?.next);
  assert.ok(pkg.dependencies?.react);
  assert.ok(pkg.dependencies?.["react-dom"]);
});

test("App Router contains the system top-level pages", () => {
  const pages = [
    "src/app/page.tsx",
    "src/app/groups/page.tsx",
    "src/app/sources/page.tsx",
    "src/app/accounts/page.tsx",
    "src/app/settings/page.tsx",
    "src/app/logs/page.tsx",
  ];

  for (const page of pages) {
    assert.equal(existsSync(projectPath(page)), true, `${page} should exist`);
  }
});

test("application shell uses route-backed top navigation and a settings dialog action", () => {
  const shell = source("src/components/app-shell.tsx");
  const settingsDialog = source("src/components/settings-dialog.tsx");

  assert.match(shell, /usePathname/);
  assert.match(shell, /href:\s*"\/groups"/);
  assert.match(shell, /href:\s*"\/"/);
  assert.match(shell, /href:\s*"\/sources"/);
  assert.match(shell, /href:\s*"\/accounts"/);
  assert.match(shell, /href:\s*"\/logs"/);
  assert.doesNotMatch(shell, /href:\s*"\/settings"/);
  assert.match(shell, /分组倍率/);
  assert.match(shell, /倍率采集/);
  assert.match(shell, /账号调度/);
  assert.match(shell, /系统日志/);
  assert.match(shell, /SettingsDialog/);
  assert.match(settingsDialog, /打开全局配置/);
  assert.match(settingsDialog, /@radix-ui\/react-dialog/);
  assert.match(settingsDialog, /SettingsForm presentation="dialog"/);
});

test("root layout mounts the application shell and global styles", () => {
  const layout = source("src/app/layout.tsx");

  assert.match(layout, /import "\.\/globals\.css"/);
  assert.match(layout, /AppShell/);
  assert.match(layout, /lang="zh-CN"/);
});

test("responsive shell uses a Vercel-style top navigation without horizontal page overflow", () => {
  const styles = source("src/app/globals.css");
  const shell = source("src/components/app-shell.tsx");

  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(shell, /sticky top-0/);
  assert.match(shell, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(shell, /justify-self-start/);
  assert.match(shell, /justify-self-center/);
  assert.match(shell, /justify-self-end/);
  assert.ok((shell.match(/max-w-7xl/g) ?? []).length >= 2);
  assert.match(shell, /md:grid/);
  assert.match(shell, /md:hidden/);
  assert.match(shell, /overflow-x-auto/);
  assert.doesNotMatch(shell, /fixed inset-x-0 bottom-0/);
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
  assert.match(styles, /page-description[\s\S]*text-foreground\/65/);
});

test("application shell exposes an accessible persisted theme toggle", () => {
  const shell = source("src/components/app-shell.tsx");
  const toggle = source("src/components/theme-toggle.tsx");

  assert.match(shell, /ThemeToggle/);
  assert.match(shell, /Worker 已连接/);
  assert.match(shell, /\/api\/worker\/status/);
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
    "src/components/settings-dialog.tsx",
    "src/components/settings-form.tsx",
    "src/components/worker-status-panel.tsx",
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/groups/group-rule-table.tsx",
    "src/components/groups/group-rule-dialog.tsx",
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
  for (const dataComponent of ["src/components/accounts/accounts-dashboard.tsx", "src/components/groups/group-rule-table.tsx", "src/components/sources/source-rates-table.tsx", "src/components/sources/source-site-table.tsx"]) {
    assert.doesNotMatch(source(dataComponent), /text-primary/, `${dataComponent} should not use low-contrast orange for data text`);
  }
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

test("forms use compact semantic number controls and lists share tag styling", () => {
  const compactInput = source("src/components/ui/compact-number-input.tsx");
  const tag = source("src/components/ui/tag.tsx");
  const forms = [
    "src/components/settings-form.tsx",
    "src/components/sources/source-site-dialog.tsx",
    "src/components/groups/group-rule-dialog.tsx",
  ].map(source).join("\n");

  assert.match(compactInput, /sm:w-\[7ch\]/);
  assert.match(compactInput, /sm:w-\[9ch\]/);
  assert.match(compactInput, /sm:w-\[11ch\]/);
  assert.match(compactInput, /sm:w-fit/);
  assert.match(compactInput, /border-l border-border/);
  assert.match(compactInput, /text-base/);
  assert.match(compactInput, /sm:text-sm/);
  assert.match(compactInput, /tabular-nums/);
  assert.match(forms, /CompactNumberInput/);
  assert.match(forms, /suffix="秒"/);
  assert.match(forms, /suffix="倍"/);
  assert.match(tag, /TagTone/);
  assert.match(tag, /whitespace-nowrap/);
  assert.match(tag, /overflow-hidden/);
  assert.match(tag, /text-xs/);
  assert.match(tag, /rounded-md border/);
  assert.match(source("src/app/globals.css"), /text-base[\s\S]*sm:text-sm/);
});

test("development and production builds use isolated Next.js output directories", () => {
  const config = source("next.config.mjs");
  const ignore = source(".gitignore");

  assert.match(config, /process\.env\.NODE_ENV === "development"/);
  assert.match(config, /distDir:\s*development \? "\.next-dev" : "\.next"/);
  assert.match(ignore, /\.next-dev\//);
});
