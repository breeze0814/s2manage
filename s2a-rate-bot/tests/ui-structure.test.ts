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
  assert.match(settingsDialog, /from "\.\/ui\/dialog"/);
  assert.match(settingsDialog, /<DialogContent/);
  assert.match(settingsDialog, /SettingsForm presentation="dialog"/);
});

test("root layout mounts the application shell and global styles", () => {
  const layout = source("src/app/layout.tsx");
  const frame = source("src/components/application-frame.tsx");

  assert.match(layout, /import "\.\/globals\.css"/);
  assert.match(layout, /import "\.\/design-system\.css"/);
  assert.match(layout, /ApplicationFrame/);
  assert.match(frame, /AppShell/);
  assert.match(frame, /pathname\.startsWith\("\/embed\/"\)/);
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

test("top-level page titles use consistent Chinese hierarchy", () => {
  const titles = [
    ["src/components/home/home-dashboard.tsx", "系统概览", "采集站、目标分组、倍率变化与 Worker 运行状态"],
    ["src/components/groups/groups-dashboard.tsx", "分组倍率", "配置目标分组绑定、计算规则与应用状态"],
    ["src/components/sources/sources-dashboard.tsx", "倍率采集", "管理采集站与最近一次成功倍率快照"],
    ["src/components/accounts/accounts-dashboard.tsx", "账号调度", "查看账号状态、倍率绑定与调度可用性"],
    ["src/components/logs/logs-dashboard.tsx", "系统日志", "外部 API 调用与 Worker 执行记录"],
    ["src/components/settings-form.tsx", "全局配置", "目标站、代理、Worker 与 Telegram 通知设置"],
  ] as const;

  for (const [path, title, description] of titles) {
    const component = source(path);
    assert.match(component, new RegExp(`page-heading[^>]*>${title}<`));
    assert.match(component, new RegExp(`page-description[^>]*>${description}<`));
  }
  const settingsDialog = source("src/components/settings-dialog.tsx");
  assert.match(settingsDialog, /全局配置/);
});

test("responsive shell uses a top navigation on desktop and mobile without page overflow", () => {
  const styles = source("src/app/globals.css");
  const shell = source("src/components/app-shell.tsx");

  assert.match(styles, /overflow-x:\s*hidden/);
  assert.match(shell, /function TopNavigation/);
  assert.match(shell, /sticky top-0 z-40/);
  assert.match(shell, /max-w-\[1720px\]/);
  assert.match(shell, /lg:hidden/);
  assert.match(shell, /移动端主导航/);
  assert.match(shell, /overflow-x-auto/);
  assert.doesNotMatch(shell, /<aside/);
  assert.doesNotMatch(shell, /fixed inset-x-0 bottom-0/);
});

test("desktop pages share a stable heading and data layout", () => {
  const styles = source("src/app/globals.css") + source("src/app/design-system.css");
  const accounts = source("src/components/accounts/accounts-dashboard.tsx");
  const groups = ["src/components/groups/group-rule-table.tsx", "src/components/groups/group-rule-table-layouts.tsx"]
    .map(source).join("\n");
  const rates = source("src/components/sources/source-rates-table.tsx");
  const settings = source("src/components/settings-form.tsx");
  const navigation = source("src/components/settings-navigation.tsx");

  assert.match(styles, /\.page-header[\s\S]*sm:flex-row/);
  assert.match(styles, /\.page-actions[\s\S]*sm:justify-end/);
  assert.match(styles, /--workspace-top/);
  assert.match(styles, /--page-chrome-offset/);
  assert.match(styles, /\.sticky-below-header/);
  assert.match(styles, /\.dashboard-split/);
  assert.match(styles, /\.source-split/);
  assert.match(styles, /\.master-detail-split/);
  assert.match(styles, /\.detail-rail/);
  assert.match(styles, /\.home-feed-viewport/);
  assert.match(accounts, /sm:grid-cols-2 lg:hidden/);
  assert.match(accounts, /hidden lg:block[\s\S]*min-w-\[920px\]/);
  assert.match(accounts, /2xl:max-w-72/);
  assert.match(groups, /min-w-\[900px\]/);
  assert.match(groups, /lg:hidden/);
  assert.match(groups, /GroupCard/);
  assert.match(groups, /BINDING_PREVIEW_LIMIT = 2/);
  assert.match(groups, /data-group-master-detail/);
  assert.match(groups, /GroupDetailPanel/);
  assert.match(groups, /master-detail-split/);
  assert.match(styles, /\.data-table-sticky thead th[\s\S]*sticky top-0/);
  assert.match(styles, /\.sticky-action-cell[\s\S]*sticky right-0/);
  for (const table of [accounts, groups, rates]) assert.match(table, /data-table-sticky/);
  assert.match(rates, /embedded-table-viewport/);
  assert.match(settings, /max-w-6xl/);
  assert.match(settings, /lg:grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.match(settings, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(settings, /dialogWide/);
  assert.match(navigation, /lg:sticky sticky-below-header/);
  assert.match(navigation, /dialogWide/);
});

test("neutral operations themes expose semantic tokens before hydration", () => {
  const styles = source("src/app/globals.css");
  const designSystem = source("src/app/design-system.css");
  const tailwind = source("tailwind.config.ts");
  const layout = source("src/app/layout.tsx");

  assert.match(styles, /--background:\s*244 246 248/);
  assert.match(styles, /\.dark\s*\{[\s\S]*--background:\s*17 20 24/);
  assert.match(styles, /--primary:\s*13 116 110/);
  assert.doesNotMatch(styles, /--sidebar:/);
  assert.doesNotMatch(styles, /background-image|radial-gradient/);
  assert.match(tailwind, /"primary-strong":\s*"rgb\(var\(--primary-strong\) \/ <alpha-value>\)"/);
  assert.match(tailwind, /surface:\s*"rgb\(var\(--surface\) \/ <alpha-value>\)"/);
  assert.match(layout, /localStorage\.getItem\("s2a-rate-theme"\)/);
  assert.match(layout, /prefers-color-scheme:\s*dark/);
  assert.match(designSystem, /page-description[\s\S]*text-muted/);
});

test("application shell exposes an accessible persisted theme toggle", () => {
  const shell = source("src/components/app-shell.tsx");
  const toggle = source("src/components/theme-toggle.tsx");

  assert.match(shell, /ThemeToggle/);
  assert.match(shell, /Worker 已连接/);
  assert.match(shell, /Worker 已连/);
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
    "src/components/groups/group-binding-selector.tsx",
    "src/components/groups/group-rule-fields.tsx",
    "src/components/groups/group-rule-preview.tsx",
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
  const groupTable = source("src/components/groups/group-rule-table.tsx")
    + source("src/components/groups/group-rule-presentations.tsx");
  const groupDialog = [
    "src/components/groups/group-rule-dialog.tsx",
    "src/components/groups/group-binding-selector.tsx",
    "src/components/groups/group-rule-fields.tsx",
    "src/components/groups/group-rule-preview.tsx",
  ].map(source).join("\n");
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
