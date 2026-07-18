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

test("browser tab uses a compact theme-aligned SVG icon", () => {
  const icon = source("src/app/icon.svg");

  assert.match(icon, /viewBox="0 0 64 64"/);
  assert.match(icon, /fill="#1c1917"/i);
  assert.match(icon, /stroke="#f99c00"/i);
  assert.match(icon, /aria-label="S2A Rate Bot"/);
  assert.doesNotMatch(icon, /<text/);
});

test("top-level page titles use consistent English and Chinese pairs", () => {
  const titles = [
    ["src/components/home/home-dashboard.tsx", "System Overview", "系统概览"],
    ["src/components/groups/groups-dashboard.tsx", "Rate Groups", "分组倍率"],
    ["src/components/sources/sources-dashboard.tsx", "Rate Sources", "倍率采集"],
    ["src/components/accounts/accounts-dashboard.tsx", "Account Pool", "号池管理"],
    ["src/components/logs/logs-dashboard.tsx", "System Logs", "系统日志"],
    ["src/components/settings-form.tsx", "Global Settings", "全局配置"],
  ] as const;

  for (const [path, english, chinese] of titles) {
    const component = source(path);
    assert.match(component, new RegExp(`page-heading[^>]*>${english}<`));
    assert.match(component, new RegExp(`page-description[^>]*>${chinese}<`));
  }
  const settingsDialog = source("src/components/settings-dialog.tsx");
  assert.match(settingsDialog, /Global Settings/);
  assert.match(settingsDialog, /全局配置/);
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
  assert.ok((shell.match(/max-w-screen-2xl/g) ?? []).length >= 2);
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

test("rate multipliers and balances use dedicated semantic data colors", () => {
  const styles = source("src/app/globals.css");
  const tailwind = source("tailwind.config.ts");
  const compactInput = source("src/components/ui/compact-number-input.tsx");
  const home = source("src/components/home/home-dashboard.tsx");
  const accounts = source("src/components/accounts/accounts-dashboard.tsx");
  const groupTable = source("src/components/groups/group-rule-table.tsx");
  const groupDialog = source("src/components/groups/group-rule-dialog.tsx");
  const effectiveRate = source("src/components/ui/effective-rate-value.tsx");
  const rateChanges = source("src/components/home/rate-change-panel.tsx");
  const sourceTable = source("src/components/sources/source-site-table.tsx");
  const rateTable = source("src/components/sources/source-rates-table.tsx");
  const settings = source("src/components/settings-form.tsx");
  const sourceDialog = source("src/components/sources/source-site-dialog.tsx");

  assert.match(styles, /--rate:/);
  assert.match(styles, /--effective-rate:/);
  assert.match(styles, /--balance:/);
  assert.match(tailwind, /rate:\s*"rgb\(var\(--rate\) \/ <alpha-value>\)"/);
  assert.match(tailwind, /"effective-rate":\s*"rgb\(var\(--effective-rate\) \/ <alpha-value>\)"/);
  assert.match(tailwind, /"balance-value":\s*"rgb\(var\(--balance\) \/ <alpha-value>\)"/);
  assert.match(compactInput, /tone\?:\s*"default"\s*\|\s*"rate"/);
  assert.match(home, /valueClassName="text-balance-value"/);
  assert.match(home, /site\.balance[\s\S]*text-balance-value/);
  assert.match(sourceTable, /text-balance-value/);
  assert.match(effectiveRate, /text-effective-rate/);
  assert.match(rateTable, /EffectiveRateValue/);
  assert.match(groupTable, /EffectiveRateValue/);
  assert.match(groupDialog, /EffectiveRateValue/);
  assert.match(rateChanges, /text-effective-rate/);
  assert.doesNotMatch(groupDialog, /<Tag tone="rate"[^>]*>[\s\S]*?有效 ×\{formatRate\(rate\.effectiveRate\)\}[\s\S]*?<\/Tag>/);
  for (const component of [accounts, groupTable, groupDialog, rateTable]) {
    assert.match(component, /(?:text-rate|tone="rate")/);
  }
  assert.match(settings, /tone="rate"/);
  assert.match(sourceDialog, /tone="rate"/);
});

test("transient system feedback uses shadcn Sonner alerts instead of inline messages", () => {
  const pkg = JSON.parse(source("package.json")) as { dependencies?: Record<string, string> };
  const layout = source("src/app/layout.tsx");
  const toaster = source("src/components/ui/sonner.tsx");
  const confirmAlert = source("src/components/ui/confirm-alert.tsx");
  const dashboards = [
    "src/components/accounts/accounts-dashboard.tsx",
    "src/components/groups/groups-dashboard.tsx",
    "src/components/sources/sources-dashboard.tsx",
  ].map(source).join("\n");
  const feedbackSources = [
    "src/components/accounts/use-accounts-dashboard.ts",
    "src/components/groups/use-groups-dashboard.ts",
    "src/components/sources/use-sources-dashboard.ts",
    "src/components/settings-form.tsx",
    "src/components/home/home-dashboard.tsx",
  ].map(source).join("\n");

  assert.ok(pkg.dependencies?.sonner);
  assert.ok(pkg.dependencies?.["@radix-ui/react-alert-dialog"]);
  assert.match(layout, /<Toaster \/>/);
  assert.match(toaster, /Toaster as Sonner/);
  assert.match(toaster, /position="top-center"/);
  assert.match(confirmAlert, /@radix-ui\/react-alert-dialog/);
  assert.match(feedbackSources, /toast\.success/);
  assert.match(feedbackSources, /toast\.error/);
  assert.doesNotMatch(dashboards, /view\.message/);
  assert.doesNotMatch(feedbackSources, /setMessage|FeedbackMessage|window\.confirm/);
});

test("dialog forms close only after a successful save", () => {
  const settingsDialog = source("src/components/settings-dialog.tsx");
  const settingsForm = source("src/components/settings-form.tsx");
  const groupDialog = source("src/components/groups/group-rule-dialog.tsx");
  const groupHook = source("src/components/groups/use-groups-dashboard.ts");
  const sourceHook = source("src/components/sources/use-sources-dashboard.ts");

  assert.match(settingsDialog, /open=\{open\}/);
  assert.match(settingsDialog, /onSaved=\{\(\) => setOpen\(false\)\}/);
  assert.match(settingsForm, /onSaved\?: \(\) => void/);
  assert.match(settingsForm, /input\.onSaved\?\.\(\)/);
  assert.match(groupDialog, /await onSave\(group\.id, draft\)/);
  assert.match(groupDialog, /setOpen\(false\)/);
  assert.match(groupHook, /Promise<boolean>/);
  assert.match(groupHook, /return true/);
  assert.match(groupHook, /return false/);
  assert.match(sourceHook, /setDialog\(\{ open: false, site: null \}\)/);
});

test("centered dialogs preserve their position during open and close animations", () => {
  const styles = source("src/app/globals.css");
  const dialogs = [
    "src/components/auth-dialog.tsx",
    "src/components/settings-dialog.tsx",
    "src/components/groups/group-rule-dialog.tsx",
    "src/components/sources/source-site-dialog.tsx",
    "src/components/ui/confirm-alert.tsx",
  ].map(source).join("\n");

  assert.match(styles, /@keyframes dialog-content-in/);
  assert.match(styles, /@keyframes dialog-content-out/);
  assert.match(styles, /\.dialog-content-motion/);
  assert.ok((dialogs.match(/dialog-content-motion/g) ?? []).length >= 5);
  assert.doesNotMatch(dialogs, /zoom-(?:in|out)-95/);
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
