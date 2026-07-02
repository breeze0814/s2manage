import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const groupPanelSource = readFileSync("src/components/app/groups-panel.tsx", "utf8");
const buttonSource = readFileSync("src/components/ui/button.tsx", "utf8");
const inputSource = readFileSync("src/components/ui/input.tsx", "utf8");
const textareaSource = readFileSync("src/components/ui/textarea.tsx", "utf8");
const selectSource = readFileSync("src/components/ui/select.tsx", "utf8");
const checkboxSource = readFileSync("src/components/ui/checkbox.tsx", "utf8");
const switchSource = readFileSync("src/components/ui/switch.tsx", "utf8");
const tableSource = readFileSync("src/components/ui/table.tsx", "utf8");
const dialogSource = readFileSync("src/components/ui/dialog.tsx", "utf8");
const toastSource = readFileSync("src/components/ui/toast.tsx", "utf8");
const passwordInputPath = "src/components/ui/password-input.tsx";
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const mobileRecordSource = readFileSync("src/components/app/mobile-record.tsx", "utf8");
const panelHeaderSource = readFileSync("src/components/app/panel-header.tsx", "utf8");
const metricCardPath = "src/components/app/metric-card.tsx";
const feedbackStatePath = "src/components/app/feedback-state.tsx";
const filterToolbarPath = "src/components/app/filter-toolbar.tsx";
const confirmDialogPath = "src/components/app/confirm-dialog.tsx";
const serviceStatusSource = readFileSync("src/components/app/service-status-panel.tsx", "utf8");
const blSyncSource = readFileSync("src/components/app/bl-sync-panel.tsx", "utf8");
const blSourceBindingsSource = readFileSync("src/components/app/bl-source-bindings.tsx", "utf8");
const upstreamMonitorSource = readFileSync("src/components/app/upstream-monitor-panel.tsx", "utf8");
const logsSource = readFileSync("src/components/app/logs-panel.tsx", "utf8");
const announcementsSource = readFileSync("src/components/app/announcements-panel.tsx", "utf8");
const accountsSource = readFileSync("src/components/app/accounts-panel.tsx", "utf8");
const botActivitySource = readFileSync("src/components/app/bot-activity-panel.tsx", "utf8");
const botActivityPartsSource = readFileSync("src/components/app/bot-activity-panel-parts.tsx", "utf8");
const botManagementLogsSource = readFileSync("src/components/app/bot-management-logs-card.tsx", "utf8");
const botManagementPartsSource = readFileSync("src/components/app/bot-management-panel-parts.tsx", "utf8");
const appSettingsSource = readFileSync("src/components/app/app-settings-page.tsx", "utf8");
const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const shellSource = readFileSync("src/components/app/shell.tsx", "utf8");
const motionOrchestratorSource = readFileSync("src/components/app/motion-orchestrator.tsx", "utf8");
const loginSource = readFileSync("src/app/login/page.tsx", "utf8");
const setupSource = readFileSync("src/app/setup/page.tsx", "utf8");
const authGuardSource = readFileSync("src/components/app/auth-guard.tsx", "utf8");
const siteSettingsSource = readFileSync("src/components/app/settings-panel.tsx", "utf8");
const authLayoutPath = "src/components/app/auth-layout.tsx";
const appPanelSources = [
  "src/components/app/announcements-panel.tsx",
  "src/components/app/accounts-panel.tsx",
  "src/components/app/bl-sync-panel.tsx",
  "src/components/app/groups-panel.tsx",
  "src/components/app/logs-panel.tsx",
  "src/components/app/service-status-panel.tsx",
  "src/components/app/settings-panel.tsx",
  "src/components/app/upstream-monitor-panel.tsx",
].map((path) => readFileSync(path, "utf8")).join("\n");
const passwordFieldSources = [
  loginSource,
  setupSource,
  shellSource,
  blSyncSource,
  accountsSource,
  appSettingsSource,
  botManagementPartsSource,
].join("\n");

function findIconButtonsMissingLabels(source: string) {
  const tags: string[] = [];
  for (const match of source.matchAll(/<Button\b/g)) {
    let quote: '"' | "'" | null = null;
    let braceDepth = 0;
    for (let index = match.index + match[0].length; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote && source[index - 1] !== "\\") quote = null;
        continue;
      }
      if (char === "\"" || char === "'") {
        quote = char;
        continue;
      }
      if (char === "{") {
        braceDepth += 1;
        continue;
      }
      if (char === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (char === ">" && braceDepth === 0) {
        tags.push(source.slice(match.index, index + 1).replace(/\s+/g, " ").trim());
        break;
      }
    }
  }
  return tags
    .filter((tag) => /\bsize="icon"/.test(tag))
    .filter((tag) => !/\baria-label=/.test(tag));
}

const mobileDefaultRateFields = groupPanelSource.match(/MobileRecordField label="默认倍率"/g) ?? [];
assert.equal(mobileDefaultRateFields.length, 1, "Groups mobile records should not repeat the default rate field");
assert.match(groupPanelSource, /MobileRecordField label="类型"/, "Groups mobile records should expose group type/platform context");
assert.match(groupPanelSource, /LoadingState/, "Groups panel page loading should use the shared loading state");
assert.doesNotMatch(groupPanelSource, /return \(\s*<div className="flex items-center gap-2 text-muted-foreground">/, "Groups panel should not use a hand-written page loading block");
assert.match(groupPanelSource, /FilterToolbar/, "Groups panel should use the shared filter toolbar");
assert.match(groupPanelSource, /FilterSearchField/, "Groups panel search should use the shared search field");
assert.match(groupPanelSource, /FilterSummary/, "Groups panel filters should expose a compact result summary");
assert.match(groupPanelSource, /<FilterField label="查找分组" htmlFor="group-search">[\s\S]*<FilterSearchField[\s\S]*id="group-search"[\s\S]*type="search"/,
  "Groups search filter should use search semantics and be associated with its visible label");
assert.match(groupPanelSource, /<FilterField label="平台" htmlFor="group-platform-filter">[\s\S]*<SelectTrigger id="group-platform-filter">/,
  "Groups platform filter should be associated with its visible label");
assert.match(groupPanelSource, /<FilterField label="类型" htmlFor="group-type-filter">[\s\S]*<SelectTrigger id="group-type-filter">/,
  "Groups type filter should be associated with its visible label");
assert.match(groupPanelSource, /filteredGroups\.map/, "Groups panel should render filtered group results");
assert.match(groupPanelSource, /没有匹配的分组/, "Groups panel should show an explicit no-result state for filtered lists");
assert.doesNotMatch(groupPanelSource, /<Button variant="outline" size="icon"/,
  "Groups mobile record actions should use visible text labels instead of icon-only buttons");
assert.match(groupPanelSource, /<MobileRecordActions>[\s\S]*<Pencil className="h-4 w-4" \/>[\s\S]*编辑[\s\S]*<Play className="h-4 w-4" \/>[\s\S]*应用[\s\S]*<Trash2 className="h-4 w-4" \/>[\s\S]*删除[\s\S]*<\/MobileRecordActions>/,
  "Groups mobile record actions should show clear edit, apply, and delete labels");
assert.doesNotMatch(groupPanelSource, /<MobileRecordField label="规则" value=\{<span className="line-clamp-2">\{ruleSummary\(rule\)\}<\/span>\} \/>/,
  "Groups mobile rule summaries should not hide custom formulas behind a two-line clamp");
assert.doesNotMatch(groupPanelSource, /<MobileRecordField label="类型" value=\{<span className="line-clamp-2">\{\[group\.platform, group\.type\]\.filter\(Boolean\)\.join\(" \/ "\) \|\| "-"\}<\/span>\} \/>/,
  "Groups mobile type fields should wrap long provider/type identifiers instead of hiding them behind a two-line clamp");
assert.doesNotMatch(groupPanelSource, /<TableCell className="max-w-\[200px\] truncate text-sm" title=\{ruleSummary\(rule\)\}>\{ruleSummary\(rule\)\}<\/TableCell>/,
  "Groups desktop rule summaries should wrap instead of truncating custom formulas");
assert.match(groupPanelSource, /<MobileRecordField label="规则" value=\{<span className="whitespace-normal break-words \[overflow-wrap:anywhere\]">\{ruleSummary\(rule\)\}<\/span>\} \/>/,
  "Groups mobile rule summaries should wrap long custom formulas");
assert.match(groupPanelSource, /<MobileRecordField label="类型" value=\{<span className="whitespace-normal break-words text-sm leading-5 \[overflow-wrap:anywhere\]">\{\[group\.platform, group\.type\]\.filter\(Boolean\)\.join\(" \/ "\) \|\| "-"\}<\/span>\} \/>/,
  "Groups mobile type fields should wrap long provider/type identifiers");
assert.match(groupPanelSource, /<TableCell className="max-w-\[260px\] whitespace-normal break-words text-sm leading-5 \[overflow-wrap:anywhere\]" title=\{ruleSummary\(rule\)\}>\{ruleSummary\(rule\)\}<\/TableCell>/,
  "Groups desktop rule summaries should wrap long custom formulas in the table");
assert.match(groupPanelSource, /<Label htmlFor="group-name">分组名称<\/Label>[\s\S]*<Input[\s\S]*id="group-name"/,
  "Group editor name input should be associated with its visible label");
assert.match(groupPanelSource, /<Label htmlFor="group-rate-multiplier">默认倍率<\/Label>[\s\S]*<Input[\s\S]*id="group-rate-multiplier"/,
  "Group editor default rate input should be associated with its visible label");
assert.match(groupPanelSource, /<Label htmlFor="group-rate-rule-mode">计算方式<\/Label>[\s\S]*<SelectTrigger id="group-rate-rule-mode">/,
  "Group editor rate rule mode select should be associated with its visible label");
assert.match(groupPanelSource, /<Label htmlFor="group-rate-rule-expression">自定义公式<\/Label>[\s\S]*<Textarea[\s\S]*id="group-rate-rule-expression"/,
  "Group editor custom rate rule expression should be associated with its visible label");
assert.match(groupPanelSource, /<Label htmlFor="group-rate-rule-offset">偏移<\/Label>[\s\S]*<Input[\s\S]*id="group-rate-rule-offset"/,
  "Group editor rate rule offset input should be associated with its visible label");

assert.match(appPanelSources, /PanelHeader/, "Primary app panels should use the shared PanelHeader layout");
assert.match(appPanelSources, /PanelActions/, "Primary app panels should use the shared PanelActions control wrapper");
assert.match(panelHeaderSource, /lg:flex-row lg:items-center lg:justify-between/, "Panel headers should stay stacked through narrow tablet layouts");
assert.match(panelHeaderSource, /lg:flex lg:w-auto lg:flex-wrap/, "Panel actions should stay in a grid through narrow tablet layouts");
assert.doesNotMatch(panelHeaderSource, /sm:flex-row|sm:flex sm:w-auto/, "Panel headers and actions should not switch to horizontal layout at the narrow tablet breakpoint");

assert.match(buttonSource, /min-h-11/, "Default buttons should provide touch-friendly height");
assert.doesNotMatch(buttonSource, /sm:min-h-(?:8|9)|sm:min-w-9/, "Buttons should not shrink touch targets at the small breakpoint");
assert.match(buttonSource, /lg:min-h-9/, "Buttons should keep dense desktop sizing where appropriate");
assert.match(buttonSource, /sm: "min-h-11/, "Small buttons should provide 44px touch height on mobile");
assert.match(buttonSource, /icon: "min-h-11 min-w-11/, "Icon buttons should provide 44px touch targets on mobile");
assert.match(buttonSource, /lg:min-h-8/, "Small buttons should retain compact desktop density");
assert.match(inputSource, /min-h-11/, "Inputs should provide touch-friendly height on small screens");
assert.doesNotMatch(inputSource, /sm:min-h-9|sm:py-1/, "Inputs should not shrink touch targets at the small breakpoint");
assert.match(inputSource, /lg:min-h-9/, "Inputs should retain dense desktop sizing");
assert.match(inputSource, /inputMode=\{resolvedInputMode\}/, "Inputs should expose a resolved inputMode to improve mobile keyboards");
assert.match(inputSource, /type === "number" \? "decimal" : undefined/, "Number inputs should default to a numeric mobile keyboard");
assert.match(textareaSource, /min-h-24/, "Textareas should have enough vertical reading and touch area");
assert.match(selectSource, /min-h-11/, "Select triggers should provide touch-friendly height on small screens");
assert.doesNotMatch(selectSource, /sm:min-h-(?:8|9)|sm:py-1/, "Select controls should not shrink touch targets at the small breakpoint");
assert.match(selectSource, /lg:min-h-9/, "Select triggers should retain dense desktop sizing");
assert.match(selectSource, /min-h-11/, "Select options should provide touch-friendly item height");
assert.match(checkboxSource, /min-h-11/, "Checkbox controls should provide a 44px touch target on small screens");
assert.match(checkboxSource, /min-w-11/, "Checkbox controls should provide a 44px touch target width on small screens");
assert.doesNotMatch(checkboxSource, /sm:min-h-4|sm:min-w-4/, "Checkbox controls should not shrink touch targets at the small breakpoint");
assert.match(checkboxSource, /lg:min-h-4/, "Checkbox controls should retain compact desktop density");
assert.match(switchSource, /min-h-11/, "Switch controls should provide a 44px touch target on small screens");
assert.match(switchSource, /min-w-11/, "Switch controls should provide a 44px touch target width on small screens");
assert.doesNotMatch(switchSource, /sm:min-h-5|sm:min-w-9/, "Switch controls should not shrink touch targets at the small breakpoint");
assert.match(switchSource, /lg:min-h-5/, "Switch controls should retain compact desktop density");
assert.equal(existsSync(passwordInputPath), true, "Password and secret inputs should share a reusable visibility-toggle component");
const passwordInputSource = existsSync(passwordInputPath) ? readFileSync(passwordInputPath, "utf8") : "";
assert.match(passwordInputSource, /EyeOff/, "PasswordInput should use a clear hide-password icon");
assert.match(passwordInputSource, /Eye/, "PasswordInput should use a clear show-password icon");
assert.match(passwordInputSource, /aria-label=\{visible \? hideLabel : showLabel\}/, "PasswordInput toggle should expose its action to screen readers");
assert.match(passwordInputSource, /type=\{visible \? "text" : "password"\}/, "PasswordInput should switch between masked and visible text");
assert.match(passwordInputSource, /min-h-11/, "PasswordInput visibility toggle should provide a 44px touch target on mobile");
assert.match(passwordInputSource, /min-w-11/, "PasswordInput visibility toggle should provide a 44px touch target width on mobile");
assert.doesNotMatch(passwordInputSource, /sm:min-h-8|sm:min-w-8/, "PasswordInput visibility toggle should not shrink at the small breakpoint");
assert.match(passwordInputSource, /lg:min-h-8/, "PasswordInput visibility toggle should retain compact desktop density");
assert.doesNotMatch(passwordFieldSources, /type="password"/, "App forms should use PasswordInput instead of raw password fields");
assert.match(passwordFieldSources, /PasswordInput/, "App forms should expose password visibility toggles");
assert.doesNotMatch(globalsSource, /letter-spacing:\s*-\d/, "Global typography should not use negative letter spacing");
assert.doesNotMatch(appPanelSources + shellSource + loginSource + setupSource, /tracking-tight/, "App UI text should keep neutral letter spacing for Chinese and mixed-language labels");
assert.deepEqual(findIconButtonsMissingLabels(appPanelSources + shellSource), [], "Icon-only buttons should expose aria-label, not only title text");
assert.match(layoutSource, /href="#main-content"/, "Root layout should provide a skip link to the main content");
assert.match(layoutSource, /跳到主要内容/, "Skip link should use a clear Chinese label");
assert.match(layoutSource, /sr-only[\s\S]*focus:not-sr-only/, "Skip link should stay visually hidden until keyboard focus");
assert.match(shellSource, /id="main-content"[\s\S]*tabIndex=\{-1\}/, "Shell work area should expose a focusable main-content target");
assert.match(motionOrchestratorSource, /prefers-reduced-motion:\s*reduce/, "Motion orchestrator should detect reduced-motion preference");
assert.match(globalsSource, /@media \(prefers-reduced-motion:\s*reduce\)/, "Global CSS should disable non-essential animations for reduced-motion users");
assert.match(globalsSource, /animation-duration:\s*0\.01ms !important/, "Reduced-motion CSS should effectively suppress CSS keyframe animations");
assert.match(globalsSource, /transition-duration:\s*0\.01ms !important/, "Reduced-motion CSS should effectively suppress decorative transitions");

assert.match(tableSource, /max-h-\[70dvh\]/, "Tables should cap height and keep large datasets scrollable");
assert.match(tableSource, /role="region"/, "Scrollable table containers should expose a region for assistive technology");
assert.match(tableSource, /aria-label="可横向滚动的数据表"/, "Scrollable table containers should describe their horizontal scrolling behavior");
assert.match(tableSource, /tabIndex=\{0\}/, "Scrollable table containers should be keyboard-focusable for horizontal scrolling");
assert.match(tableSource, /\[-webkit-overflow-scrolling:touch\]/, "Scrollable table containers should use momentum scrolling on touch devices");
assert.match(tableSource, /\[scrollbar-gutter:stable\]/, "Scrollable table containers should reserve stable scrollbar space to avoid layout shifts");
assert.match(tableSource, /sticky top-0 z-10/, "Table headers should remain visible while scrolling");
assert.match(tableSource, /tabular-nums/, "Table cells should use tabular numbers for operational data");
assert.match(tableSource, /function TableEmptyRow/, "Tables should expose a shared empty/loading row");
assert.match(tableSource, /py-10/, "Shared table empty rows should provide enough visual breathing room");
assert.match(tableSource, /colSpan/, "Shared table empty rows should accept a column span");
assert.match(tableSource, /function TableActionHead/, "Tables should expose a shared sticky action header cell");
assert.match(tableSource, /function TableActionCell/, "Tables should expose a shared sticky action body cell");
assert.match(tableSource, /sticky right-0/, "Sticky table action cells should remain visible during horizontal scroll");

assert.match(dialogSource, /bg-slate-950\/\[0\.48\]/, "Light-mode dialogs need a stronger scrim for foreground focus");
assert.match(dialogSource, /size-10/, "Dialog close control should have a touch-friendly hit area");
assert.match(dialogSource, /function DialogBody/, "Large dialogs should expose a shared scrollable body");
assert.match(dialogSource, /min-h-0 overflow-y-auto/, "Dialog bodies should scroll without growing past the viewport");
assert.match(dialogSource, /px-4/, "Dialog bodies should provide safe mobile gutters");
assert.doesNotMatch(dialogSource, /sm:flex-row|sm:\[&>button\]:w-auto/,
  "Dialog footers should not compress actions into a horizontal row at the small breakpoint");
assert.match(dialogSource, /lg:flex-row lg:justify-end/,
  "Dialog footers should wait until the large breakpoint before placing actions in a row");
assert.match(dialogSource, /lg:\[&>button\]:w-auto/,
  "Dialog footer buttons should stay full-width through narrow tablet layouts");
assert.match(mobileRecordSource, /space-y-3 lg:hidden/, "Mobile record lists should remain available through narrow tablet layouts");
assert.match(mobileRecordSource, /text-muted-foreground lg:hidden/, "Mobile record empty states should remain available through narrow tablet layouts");
assert.doesNotMatch(mobileRecordSource, /md:hidden/, "Mobile record layouts should not disappear at the narrow tablet breakpoint");
assert.match(mobileRecordSource, /\[&_button\]:min-h-11/, "Mobile record actions should enforce 44px button hit targets");
assert.match(mobileRecordSource, /\[&_button\]:min-w-11/, "Mobile record icon actions should enforce 44px button width");

assert.equal(existsSync(metricCardPath), true, "Operational dashboards should share a reusable MetricCard component");
assert.equal(existsSync(feedbackStatePath), true, "Panels should share reusable loading and empty states");

const metricCardSource = existsSync(metricCardPath) ? readFileSync(metricCardPath, "utf8") : "";
const feedbackStateSource = existsSync(feedbackStatePath) ? readFileSync(feedbackStatePath, "utf8") : "";
assert.match(metricCardSource, /type MetricTone/, "MetricCard should expose semantic tones");
assert.match(metricCardSource, /tabular-nums/, "MetricCard values should use tabular numbers");
assert.match(feedbackStateSource, /function LoadingState/, "Shared feedback states should include LoadingState");
assert.match(feedbackStateSource, /function EmptyState/, "Shared feedback states should include EmptyState");
assert.match(feedbackStateSource, /function ErrorState/, "Shared feedback states should include ErrorState for page-level failures");
assert.match(feedbackStateSource, /function InlineError/, "Shared feedback states should include InlineError for form-level failures");
assert.match(feedbackStateSource, /role="status"/, "LoadingState should announce progress as a polite status region");
assert.match(feedbackStateSource, /aria-live="polite"/, "LoadingState should avoid interrupting users while announcing progress");
assert.match(feedbackStateSource, /<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" \/>/,
  "LoadingState spinner should be hidden from assistive technology");
assert.match(feedbackStateSource, /\[&>button\]:w-full lg:\[&>button\]:w-auto/,
  "EmptyState actions should remain full-width through narrow tablet layouts");
assert.match(feedbackStateSource, /AlertTriangle/, "ErrorState should use a clear warning icon");
assert.match(feedbackStateSource, /role="alert"/, "ErrorState should announce errors to assistive technology");
assert.match(feedbackStateSource, /aria-live="assertive"/, "ErrorState should use an assertive live region for failures");
assert.match(feedbackStateSource, /<div className="min-w-0 break-words leading-6">\{children\}<\/div>/,
  "InlineError should support structured error and warning content");

assert.match(toastSource, /top-\[max\(1rem,env\(safe-area-inset-top\)\)\]/,
  "Toast viewport should respect the top safe area on mobile devices");
assert.match(toastSource, /left-\[max\(1rem,env\(safe-area-inset-left\)\)\]/,
  "Toast viewport should respect the left safe area on mobile devices");
assert.match(toastSource, /right-\[max\(1rem,env\(safe-area-inset-right\)\)\]/,
  "Toast viewport should respect the right safe area on mobile devices");
assert.match(toastSource, /aria-live=\{toast\.variant === "error" \? "assertive" : "polite"\}/,
  "Toast live regions should use assertive announcements only for errors");
assert.match(toastSource, /<Icon className=\{cn\("mt-0\.5 size-5 shrink-0", iconStyles\[toast\.variant\]\)\} aria-hidden="true" \/>/,
  "Toast status icons should be hidden from assistive technology");
assert.match(toastSource, /min-h-11 min-w-11/,
  "Toast close buttons should provide a 44px touch target");
assert.match(toastSource, /<X className="size-4" aria-hidden="true" \/>/,
  "Toast close icons should be decorative because the button has an aria-label");

assert.match(serviceStatusSource, /MetricCard/, "Service status should use shared metric cards");
assert.match(serviceStatusSource, /ErrorState/, "Service status page errors should use the shared error state");
assert.doesNotMatch(serviceStatusSource, /return <p className="text-sm text-destructive">加载服务状态失败：\{error\.message\}<\/p>/,
  "Service status page errors should not render as bare destructive text");
assert.match(serviceStatusSource, /<MobileRecordList className="p-3">\s*\{\s*data\.recentLogs\.items\.map/, "Service status recent logs should render a mobile card list");
assert.match(serviceStatusSource, /MobileRecordField label="时间"/, "Service status mobile log cards should show log time");
assert.match(serviceStatusSource, /MobileRecordField label="目标"/, "Service status mobile log cards should show log target");
assert.match(serviceStatusSource, /MobileRecordField label="错误"/, "Service status mobile log cards should show log error details");
assert.match(serviceStatusSource, /EmptyState title="暂无任务日志"/, "Service status mobile log empty feedback should use the shared empty state");
assert.doesNotMatch(serviceStatusSource, /<MobileRecordEmpty>暂无日志<\/MobileRecordEmpty>/, "Service status mobile log empty feedback should not use a hand-written text row");
assert.doesNotMatch(serviceStatusSource, /confirm\(/, "Service status maintenance actions should not use the browser confirm dialog");
assert.match(serviceStatusSource, /ConfirmDialog/, "Service status maintenance actions should use the in-app confirmation dialog");
assert.match(serviceStatusSource, /<div className="hidden lg:block">/, "Service status recent logs desktop table should be hidden through narrow tablets");
assert.doesNotMatch(serviceStatusSource, /p-3 md:flex-row md:items-center md:justify-between/,
  "Service status maintenance actions should not compress into a horizontal row at the narrow tablet breakpoint");
assert.match(serviceStatusSource, /p-3 lg:flex-row lg:items-center lg:justify-between/,
  "Service status maintenance actions should wait until the large breakpoint before moving actions beside descriptions");
assert.doesNotMatch(serviceStatusSource, /className="w-full shrink-0 md:w-auto"/,
  "Service status maintenance buttons should remain full-width through narrow tablets");
assert.match(serviceStatusSource, /className="w-full shrink-0 lg:w-auto"/,
  "Service status maintenance buttons should only shrink once the large breakpoint has enough width");
assert.doesNotMatch(serviceStatusSource, /mt-3 grid gap-2 text-xs md:grid-cols-2/,
  "Service status cleanup result details should stay single-column through narrow tablets");
assert.match(serviceStatusSource, /mt-3 grid gap-2 text-xs lg:grid-cols-2 xl:grid-cols-4/,
  "Service status cleanup result details should use denser columns only from the large breakpoint");
assert.match(blSyncSource, /MetricCard/, "BL sync dashboard metrics should use shared metric cards");
assert.doesNotMatch(blSyncSource, /grid gap-3 md:grid-cols-4/,
  "BL sync metric cards should not collapse into four cramped columns at the narrow tablet breakpoint");
assert.match(blSyncSource, /grid gap-3 md:grid-cols-2 xl:grid-cols-4/,
  "BL sync metric cards should use two columns on narrow tablets and reserve four columns for wide screens");
assert.match(blSyncSource, /LoadingState/, "BL sync loading feedback should use the shared loading state");
assert.doesNotMatch(blSyncSource, /ErrorState title="同步操作失败"/, "BL sync rate synchronization mutation errors should stay inside the confirmation dialog");
assert.doesNotMatch(blSyncSource, /<p className="text-sm text-destructive">\{syncError\}<\/p>/,
  "BL sync page errors should not render as bare destructive text");
assert.match(blSyncSource, /InlineError/, "BL sync form errors should use the shared inline error state");
assert.doesNotMatch(blSyncSource, /<p className="text-sm text-destructive">\{formError\}<\/p>/,
  "BL sync form errors should not render as bare destructive text");
const blSyncEmptyStates = blSyncSource.match(/<EmptyState/g) ?? [];
assert.ok(blSyncEmptyStates.length >= 4, "BL sync empty and no-result feedback should use shared empty states");
assert.match(blSyncSource, /MobileRecordList/, "BL sync rate collection should expose a mobile card list");
assert.match(blSyncSource, /<MobileRecordList className="p-3 lg:hidden">/, "BL sync rate collection mobile list should replace the wide rate table through narrow tablets");
assert.match(blSyncSource, /hidden lg:block/, "BL sync rate collection desktop table should be hidden through narrow tablets");
assert.match(blSyncSource, /MobileRecordField label="写入倍率"/, "BL sync mobile rate cards should show the write rate");
assert.match(blSyncSource, /MobileRecordField label="原始倍率"/, "BL sync mobile rate cards should show the original rate");
assert.match(blSyncSource, /MobileRecordField label="生效倍率"/, "BL sync mobile rate cards should show the effective rate");
assert.match(blSyncSource, /setSelectedRateKey\(key\)/, "BL sync mobile rate cards should support selecting a collected rate");
assert.match(blSyncSource, /<MobileRecordList className="p-3">\s*\{\s*sitesList\.map/, "BL sync source sites should render a mobile card list");
assert.match(blSyncSource, /MobileRecordField label="间隔"/, "BL sync mobile source cards should show collection interval");
assert.match(blSyncSource, /MobileRecordField label="充值倍率"/, "BL sync mobile source cards should show recharge ratio");
assert.match(blSyncSource, /MobileRecordField label="余额"/, "BL sync mobile source cards should show balance");
assert.match(blSyncSource, /MobileRecordField label="最近成功"/, "BL sync mobile source cards should show last success time");
assert.doesNotMatch(blSyncSource, /confirm\(/, "BL sync destructive site actions should not use the browser confirm dialog");
assert.match(blSyncSource, /ConfirmDialog/, "BL sync destructive site actions should use the in-app confirmation dialog");
assert.doesNotMatch(blSyncSource, /<Dialog open=\{confirmOpen\}/, "BL sync rate synchronization should use the shared confirmation dialog instead of a hand-written dialog");
assert.match(blSyncSource, /title="确认同步倍率"[\s\S]*confirmLabel="确认同步"[\s\S]*error=\{syncError\}/,
  "BL sync rate synchronization confirmation should surface mutation errors through ConfirmDialog");
assert.doesNotMatch(blSyncSource, /<p className="text-destructive">该操作会直接更新目标 Sub2API 分组倍率。<\/p>/,
  "BL sync rate synchronization warnings should not render as bare destructive text");
assert.match(blSyncSource, /TableActionHead className="w-56"/, "BL sync source site table should keep operation columns visible while horizontally scrolling");
assert.match(blSyncSource, /<TableActionCell>/, "BL sync source site rows should use the shared sticky operation cell");
assert.doesNotMatch(blSyncSource, /<div className="max-w-\[220px\] truncate text-xs text-muted-foreground" title=\{site\.lastError\}>\{site\.lastError\}<\/div>/,
  "BL sync source site desktop errors should wrap instead of truncating diagnostics");
assert.match(blSyncSource, /<div className="max-w-\[280px\] whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]" title=\{site\.lastError\}>\{site\.lastError\}<\/div>/,
  "BL sync source site desktop errors should preserve readable wrapping");
assert.match(blSyncSource, /FilterToolbar/, "BL sync rate filters should use the shared filter toolbar");
assert.match(blSyncSource, /FilterSearchField/, "BL sync rate search should use the shared search field");
assert.match(blSyncSource, /FilterSummary/, "BL sync rate filters should expose a compact filter summary");
assert.match(blSyncSource, /<FilterField label="查找倍率" htmlFor="bl-rate-search">[\s\S]*<FilterSearchField[\s\S]*id="bl-rate-search"[\s\S]*type="search"/,
  "BL sync rate search should use search semantics and be associated with its visible label");
assert.match(blSyncSource, /<FilterField label="平台" htmlFor="bl-rate-platform-filter">[\s\S]*<SelectTrigger id="bl-rate-platform-filter">/,
  "BL sync platform filter should be associated with its visible label");
assert.match(blSyncSource, /<FilterField label="采集源" htmlFor="bl-rate-site-filter">[\s\S]*<SelectTrigger id="bl-rate-site-filter">/,
  "BL sync source-site filter should be associated with its visible label");
assert.match(blSyncSource, /<FilterField label="目标分组" htmlFor="bl-rate-target-group">[\s\S]*<SelectTrigger id="bl-rate-target-group">/,
  "BL sync target-group filter should be associated with its visible label");
assert.match(blSourceBindingsSource, /InlineError/, "BL source binding selector errors should use the shared inline error state");
assert.doesNotMatch(blSourceBindingsSource, /<p className="text-sm text-destructive">\{errorMessage\}<\/p>/,
  "BL source binding selector errors should not render as bare destructive text");
assert.doesNotMatch(blSourceBindingsSource, /className="grid size-5 shrink-0 place-items-center/,
  "BL source binding selected-chip remove controls should not use a 20px touch target");
assert.match(blSourceBindingsSource, /<Button[\s\S]*variant="ghost"[\s\S]*size="icon"[\s\S]*aria-label=\{`移除 \$\{getSourceLabel\(binding\)\}`\}/,
  "BL source binding selected-chip remove controls should use the shared icon button sizing");
assert.doesNotMatch(blSourceBindingsSource, /className="h-7 px-2 text-xs"/,
  "BL source binding clear action should not override shared touch-friendly button height");
assert.doesNotMatch(blSourceBindingsSource, /max-w-\[7rem\] shrink truncate text-\[11px\]/,
  "BL source binding selected chips should wrap long source-site names instead of truncating them");
assert.doesNotMatch(blSourceBindingsSource, /<span className="truncate font-medium">\{getSourceLabel\(binding\)\}<\/span>/,
  "BL source binding selected chips should wrap long source group names instead of truncating them");
const blSyncHiddenDesktopTables = blSyncSource.match(/<div className="hidden lg:block">/g) ?? [];
assert.ok(blSyncHiddenDesktopTables.length >= 2, "BL sync source and rate desktop tables should both be hidden through narrow tablets");
assert.match(upstreamMonitorSource, /MetricCard/, "Upstream monitor metrics should use shared metric cards");
assert.doesNotMatch(upstreamMonitorSource, /grid grid-cols-2 gap-3 md:grid-cols-4/,
  "Upstream monitor metric cards should not start as two cramped columns on phones or jump to four columns at the narrow tablet breakpoint");
assert.match(upstreamMonitorSource, /grid gap-3 md:grid-cols-2 xl:grid-cols-4/,
  "Upstream monitor metric cards should use two columns on narrow tablets and reserve four columns for wide screens");
assert.match(upstreamMonitorSource, /ErrorState title="加载检测数据失败"/,
  "Upstream monitor page errors should use the shared error state");
assert.doesNotMatch(upstreamMonitorSource, /<p className="text-sm text-destructive">加载检测数据失败：\{error\.message\}<\/p>/,
  "Upstream monitor page errors should not render as bare destructive text");
assert.match(upstreamMonitorSource, /InlineError/, "Upstream monitor form errors should use the shared inline error state");
assert.doesNotMatch(upstreamMonitorSource, /<p className="text-sm text-destructive">加载模型失败：\{accountModels\.error\.message\}<\/p>/,
  "Upstream monitor model loading errors should not render as bare destructive text");
assert.doesNotMatch(upstreamMonitorSource, /<p className="text-sm text-destructive">\{formError\}<\/p>/,
  "Upstream monitor form errors should not render as bare destructive text");
assert.match(upstreamMonitorSource, /EmptyState title="暂无上游检测账号"/, "Upstream monitor mobile empty feedback should use the shared empty state");
assert.doesNotMatch(upstreamMonitorSource, /<MobileRecordEmpty>暂无账号<\/MobileRecordEmpty>/, "Upstream monitor mobile empty feedback should not use a hand-written text row");
assert.match(upstreamMonitorSource, /TableActionHead className="w-56"/, "Upstream monitor desktop table should keep the operation column visible while horizontally scrolling");
assert.match(upstreamMonitorSource, /<TableActionCell>/, "Upstream monitor rows should use the shared sticky operation cell");
assert.doesNotMatch(upstreamMonitorSource, /confirm\(/, "Upstream monitor destructive rule actions should not use the browser confirm dialog");
assert.match(upstreamMonitorSource, /ConfirmDialog/, "Upstream monitor destructive rule actions should use the in-app confirmation dialog");
assert.doesNotMatch(upstreamMonitorSource, /<div className="line-clamp-2 text-xs text-muted-foreground">\{rule\?\.lastMessage \|\| "-"\}<\/div>/,
  "Upstream monitor mobile last-check messages should wrap instead of hiding diagnostics behind a two-line clamp");
assert.doesNotMatch(upstreamMonitorSource, /<MobileRecordField label="类型" value=\{<span className="line-clamp-2">\{\[row\.platform, row\.type\]\.filter\(Boolean\)\.join\(" \/ "\) \|\| "-"\}<\/span>\} \/>/,
  "Upstream monitor mobile type fields should wrap long provider/type identifiers instead of hiding them behind a two-line clamp");
assert.doesNotMatch(upstreamMonitorSource, /<div className="mt-1 max-w-\[220px\] truncate text-xs text-muted-foreground" title=\{rule\?\.lastMessage \?\? ""\}>\{rule\?\.lastMessage \|\| "-"\}<\/div>/,
  "Upstream monitor desktop last-check messages should wrap instead of truncating diagnostics");
assert.match(upstreamMonitorSource, /<div className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]">\{rule\?\.lastMessage \|\| "-"\}<\/div>/,
  "Upstream monitor mobile last-check messages should preserve readable wrapping");
assert.match(upstreamMonitorSource, /<MobileRecordField label="类型" value=\{<span className="whitespace-normal break-words text-sm leading-5 \[overflow-wrap:anywhere\]">\{\[row\.platform, row\.type\]\.filter\(Boolean\)\.join\(" \/ "\) \|\| "-"\}<\/span>\} \/>/,
  "Upstream monitor mobile type fields should wrap long provider/type identifiers");
assert.match(upstreamMonitorSource, /<div className="mt-1 max-w-\[280px\] whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]" title=\{rule\?\.lastMessage \?\? ""\}>\{rule\?\.lastMessage \|\| "-"\}<\/div>/,
  "Upstream monitor desktop last-check messages should preserve readable wrapping");
assert.doesNotMatch(upstreamMonitorSource, /<Button variant="outline" size="icon"/,
  "Upstream monitor mobile record actions should use visible text labels instead of icon-only buttons");
const upstreamMobileActionsSource = upstreamMonitorSource.match(/<MobileRecordActions>[\s\S]*?<\/MobileRecordActions>/)?.[0] ?? "";
assert.match(upstreamMobileActionsSource, /<Settings2 className="h-4 w-4" \/>[\s\S]*编辑规则[\s\S]*配置规则/,
  "Upstream monitor mobile settings action should show clear configure and edit labels");
assert.match(upstreamMobileActionsSource, /<PauseCircle className="h-4 w-4" \/>[\s\S]*<Play className="h-4 w-4" \/>[\s\S]*停用检测[\s\S]*启用检测/,
  "Upstream monitor mobile toggle action should show clear enable and disable labels");
assert.match(upstreamMobileActionsSource, /<Activity className="h-4 w-4 text-blue-500" \/>[\s\S]*立即检测/,
  "Upstream monitor mobile run action should show a clear run-now label");
assert.match(upstreamMobileActionsSource, /<RotateCcw className="h-4 w-4 text-teal-600" \/>[\s\S]*恢复调度/,
  "Upstream monitor mobile resume action should show a clear resume label");
assert.match(upstreamMobileActionsSource, /<Trash2 className="h-4 w-4" \/>[\s\S]*删除规则/,
  "Upstream monitor mobile delete action should show a clear delete label");
assert.doesNotMatch(upstreamMonitorSource, /className="w-full sm:w-auto" onClick=\{handleRefresh\}/,
  "Upstream monitor refresh should remain a full-width touch target through narrow tablet layouts");
assert.match(upstreamMonitorSource, /className="w-full lg:w-auto" onClick=\{handleRefresh\}/,
  "Upstream monitor refresh should only shrink once the large breakpoint has enough width");
assert.match(appPanelSources, /LoadingState/, "Primary panels should use the shared loading state");
assert.doesNotMatch(appPanelSources, /hidden md:block/, "Primary panel desktop tables should not appear at the narrow tablet breakpoint");

assert.equal(existsSync(filterToolbarPath), true, "Search and filter areas should share a reusable FilterToolbar component");
const filterToolbarSource = existsSync(filterToolbarPath) ? readFileSync(filterToolbarPath, "utf8") : "";
assert.match(filterToolbarSource, /function FilterToolbar/, "FilterToolbar should provide the outer toolbar layout");
assert.match(filterToolbarSource, /function FilterField/, "FilterToolbar should provide consistent labeled fields");
assert.match(filterToolbarSource, /function FilterSummary/, "FilterToolbar should provide a compact result summary row");
assert.match(filterToolbarSource, /lg:grid-cols-\[repeat\(var\(--filter-columns\),minmax\(0,1fr\)\)\]/, "FilterToolbar should use a column CSS variable for responsive grids");
assert.doesNotMatch(filterToolbarSource, /sm:flex-row sm:items-center sm:justify-between/,
  "FilterSummary should not compress summary text and actions into one row at the narrow tablet breakpoint");
assert.doesNotMatch(filterToolbarSource, /sm:\[&>button\]:flex-none/,
  "FilterSummary actions should remain full-width through narrow tablet layouts");
assert.match(filterToolbarSource, /lg:flex-row lg:items-center lg:justify-between/,
  "FilterSummary should wait until the large breakpoint before using a horizontal layout");
assert.match(filterToolbarSource, /lg:\[&>button\]:flex-none/,
  "FilterSummary action buttons should only shrink once the large breakpoint has enough width");
assert.match(logsSource, /FilterToolbar/, "Logs panel should use the shared filter toolbar");
assert.match(logsSource, /LoadingState/, "Logs panel page loading should use the shared loading state");
assert.match(logsSource, /ErrorState title="加载日志设置失败"/, "Logs settings loading errors should use the shared error state");
assert.match(logsSource, /ErrorState title="保存日志设置失败"/, "Logs settings save errors should use the shared error state");
assert.doesNotMatch(logsSource, /<p className="text-sm text-destructive lg:col-span-5">加载日志设置失败：\{settingsQueryError\.message\}<\/p>/,
  "Logs settings loading errors should not render as bare destructive text");
assert.match(logsSource, /<Label htmlFor="logs-retention-days">保存天数<\/Label>[\s\S]*<Input[\s\S]*id="logs-retention-days"/,
  "Logs retention days input should be associated with its visible label");
assert.match(logsSource, /<Label htmlFor="logs-min-level">记录级别<\/Label>[\s\S]*<SelectTrigger id="logs-min-level">/,
  "Logs minimum level select should be associated with its visible label");
assert.match(logsSource, /<FilterField label="连接" htmlFor="logs-connection-filter">[\s\S]*<SelectTrigger id="logs-connection-filter">/,
  "Logs connection filter should be associated with its visible label");
assert.match(logsSource, /<FilterField label="级别" htmlFor="logs-level-filter">[\s\S]*<SelectTrigger id="logs-level-filter">/,
  "Logs level filter should be associated with its visible label");
assert.match(logsSource, /<FilterField label="状态" htmlFor="logs-status-filter">[\s\S]*<SelectTrigger id="logs-status-filter">/,
  "Logs status filter should be associated with its visible label");
assert.match(logsSource, /<FilterField label="显示条数" htmlFor="logs-limit">[\s\S]*<Input[\s\S]*id="logs-limit"/,
  "Logs limit input should be associated with its visible label");
assert.match(logsSource, /<FilterField label="动作" htmlFor="logs-action-filter">[\s\S]*<Input[\s\S]*id="logs-action-filter"[\s\S]*type="search"/,
  "Logs action filter should use search semantics and be associated with its visible label");
assert.match(logsSource, /<FilterField label="目标" htmlFor="logs-target-filter">[\s\S]*<Input[\s\S]*id="logs-target-filter"[\s\S]*type="search"/,
  "Logs target filter should use search semantics and be associated with its visible label");
assert.match(logsSource, /<FilterField label="开始时间" htmlFor="logs-date-from">[\s\S]*<Input[\s\S]*id="logs-date-from"/,
  "Logs start time filter should be associated with its visible label");
assert.match(logsSource, /<FilterField label="结束时间" htmlFor="logs-date-to">[\s\S]*<Input[\s\S]*id="logs-date-to"/,
  "Logs end time filter should be associated with its visible label");
assert.match(logsSource, /<FilterField label="全文搜索" htmlFor="logs-search">[\s\S]*<FilterSearchField[\s\S]*id="logs-search"[\s\S]*type="search"/,
  "Logs full text search should use search semantics and be associated with its visible label");
assert.doesNotMatch(logsSource, /return <div className="flex items-center gap-2 text-muted-foreground">/, "Logs panel should not use a hand-written page loading block");
assert.match(logsSource, /EmptyState/, "Logs list empty feedback should use the shared empty state");
assert.match(logsSource, /LoadingState label="加载日志\.\.\."/,
  "Logs list loading feedback should use the shared loading state");
assert.doesNotMatch(logsSource, /<MobileRecordEmpty><Loader2 className="mr-1 inline h-4 w-4 animate-spin" \/>加载中\.\.\.<\/MobileRecordEmpty>/,
  "Logs mobile list loading should not use a hand-written spinner row");
assert.doesNotMatch(logsSource, /<MobileRecordEmpty>暂无日志<\/MobileRecordEmpty>/,
  "Logs mobile list empty feedback should not use a hand-written empty row");
assert.doesNotMatch(logsSource, /<TableEmptyRow colSpan=\{6\}><Loader2 className="h-4 w-4 animate-spin" \/>加载中\.\.\.<\/TableEmptyRow>/,
  "Logs desktop list loading should not use a hand-written spinner row");
assert.doesNotMatch(logsSource, /className="w-full sm:w-auto"/,
  "Logs action buttons should remain full-width through narrow tablet layouts");
assert.doesNotMatch(logsSource, /CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"/,
  "Logs list header should not compress title and counters into one row at the narrow tablet breakpoint");
assert.match(logsSource, /className="w-full lg:w-auto"/,
  "Logs action buttons should only shrink once the large breakpoint has enough width");
assert.match(logsSource, /CardHeader className="flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"/,
  "Logs list header should wait until the large breakpoint before using a horizontal layout");
assert.doesNotMatch(logsSource, /<MobileRecordField className="col-span-2" label="目标" value=\{<span className="line-clamp-2">\{targetLabel\(log\)\}<\/span>\} \/>/,
  "Logs mobile target labels should wrap instead of hiding identifiers behind a two-line clamp");
assert.doesNotMatch(logsSource, /line-clamp-3 break-all/,
  "Logs mobile detail text should wrap long JSON and error strings instead of hiding them behind clamps");
assert.match(logsSource, /<MobileRecordField className="col-span-2" label="目标" value=\{<span className="whitespace-normal break-all text-sm leading-5 \[overflow-wrap:anywhere\]">\{targetLabel\(log\)\}<\/span>\} \/>/,
  "Logs mobile target labels should wrap long identifiers");
assert.match(logsSource, /<span className="min-w-0 whitespace-pre-wrap break-all leading-5 \[overflow-wrap:anywhere\]">\{lines\[0\]\}<\/span>/,
  "Logs mobile error detail text should preserve readable wrapping");
assert.match(logsSource, /<div className="whitespace-pre-wrap break-all text-sm leading-5 \[overflow-wrap:anywhere\]">\{lines\[0\]\}<\/div>/,
  "Logs mobile normal detail text should preserve readable wrapping");
assert.match(logsSource, /<div className="mt-1 whitespace-pre-wrap break-all text-xs leading-5 opacity-85 \[overflow-wrap:anywhere\]">\{lines\.slice\(1\)\.join\("；"\)\}<\/div>/,
  "Logs mobile secondary detail text should preserve readable wrapping");
assert.doesNotMatch(logsSource, /<TableCell className="max-w-\[180px\] truncate text-sm"/,
  "Logs desktop target cells should wrap long identifiers instead of truncating them");
assert.doesNotMatch(logsSource, /<span className="truncate">|<span className="block truncate">|<div className="truncate text-xs opacity-85">/,
  "Logs desktop detail and error text should wrap instead of being truncated");
assert.match(logsSource, /<TableCell className="max-w-\[220px\] whitespace-normal break-all text-sm leading-5"/,
  "Logs desktop target cells should wrap long target labels");
assert.match(logsSource, /className=\{`min-w-0 space-y-1 whitespace-normal break-words text-sm \$\{log\.error \? "text-destructive" : "text-muted-foreground"\} \[overflow-wrap:anywhere\]`\}/,
  "Logs desktop detail cells should use readable wrapping for long details and errors");
assert.doesNotMatch(logsSource, /confirm\(/, "Logs destructive clear actions should not use the browser confirm dialog");
assert.match(logsSource, /ConfirmDialog/, "Logs destructive clear actions should use the in-app confirmation dialog");
assert.match(announcementsSource, /FilterToolbar/, "Announcements panel should use the shared filter toolbar");
assert.match(announcementsSource, /<FilterField label="搜索" htmlFor="announcement-search"[\s\S]*<Input[\s\S]*id="announcement-search"[\s\S]*type="search"/,
  "Announcement search filter should use search semantics and be associated with its visible label");
assert.match(announcementsSource, /<FilterField label="状态" htmlFor="announcement-status-filter"[\s\S]*<SelectTrigger id="announcement-status-filter">/,
  "Announcement status filter should be associated with its visible label");
assert.match(announcementsSource, /<FilterField label="展示方式" htmlFor="announcement-notify-mode-filter"[\s\S]*<SelectTrigger id="announcement-notify-mode-filter">/,
  "Announcement notify mode filter should be associated with its visible label");
assert.match(announcementsSource, /<FilterField label="创建日期从" htmlFor="announcement-created-from"[\s\S]*<Input[\s\S]*id="announcement-created-from"/,
  "Announcement created-from filter should be associated with its visible label");
assert.match(announcementsSource, /<FilterField label="创建日期到" htmlFor="announcement-created-to"[\s\S]*<Input[\s\S]*id="announcement-created-to"/,
  "Announcement created-to filter should be associated with its visible label");
assert.doesNotMatch(announcementsSource, /<PanelActions className="sm:flex-nowrap">/,
  "Announcement header actions should not override the shared PanelActions layout at the small breakpoint");
assert.match(announcementsSource, /LoadingState/, "Announcements panel page loading should use the shared loading state");
assert.match(announcementsSource, /ErrorState title="加载公告失败"/, "Announcements list errors should use the shared error state");
assert.match(announcementsSource, /ErrorState title="加载公告规则失败"/, "Announcement rule loading errors should use the shared error state");
assert.match(announcementsSource, /ErrorState title="保存公告失败"/, "Announcement save errors should use the shared error state");
assert.match(announcementsSource, /ErrorState title="保存公告规则失败"/, "Announcement rule save errors should use the shared error state");
assert.doesNotMatch(announcementsSource, /<p className="text-sm text-destructive">加载公告失败：\{listError\.message\}<\/p>/,
  "Announcements list errors should not render as bare destructive text");
assert.match(announcementsSource, /InlineError/, "Announcement dialogs should use the shared inline error state");
assert.doesNotMatch(announcementsSource, /<p className="text-sm text-destructive">\{ruleError\}<\/p>/,
  "Announcement rule dialog errors should not render as bare destructive text");
assert.doesNotMatch(announcementsSource, /<p className="text-sm text-destructive">\{error\}<\/p>/,
  "Announcement editor errors should not render as bare destructive text");
assert.doesNotMatch(announcementsSource, /return \(\s*<div className="flex items-center gap-2 text-muted-foreground">/, "Announcements panel should not use a hand-written page loading block");
assert.match(announcementsSource, /EmptyState/, "Announcement group selectors should use shared empty feedback");
assert.match(announcementsSource, /LoadingState label="加载分组\.\.\."/,
  "Announcement group selectors should use shared loading feedback");
assert.doesNotMatch(announcementsSource, /className="w-full sm:w-auto" onClick=\{resetFilters\}/,
  "Announcement filter reset should remain a full-width touch target through narrow tablet layouts");
assert.match(announcementsSource, /className="w-full lg:w-auto" onClick=\{resetFilters\}/,
  "Announcement filter reset should only shrink once the large breakpoint has enough width");
assert.match(announcementsSource, /LoadingState label="加载公告规则\.\.\."/,
  "Announcement rule mobile list loading should use shared loading feedback");
assert.match(announcementsSource, /EmptyState title="暂无公告规则"/,
  "Announcement rule mobile list empty feedback should use the shared empty state");
assert.match(announcementsSource, /EmptyState title="暂无公告"/,
  "Announcement mobile list empty feedback should use the shared empty state");
assert.match(announcementsSource, /EmptyState title="没有匹配的公告"/,
  "Announcement mobile list no-result feedback should use the shared empty state");
assert.doesNotMatch(announcementsSource, /<MobileRecordEmpty>/,
  "Announcement mobile list feedback should not use hand-written MobileRecordEmpty rows");
assert.doesNotMatch(announcementsSource, /<Button variant="outline" size="icon"/,
  "Announcement mobile record actions should use visible text labels instead of icon-only buttons");
assert.match(announcementsSource, /<MobileRecordActions>[\s\S]*<Pencil className="h-4 w-4" \/>[\s\S]*编辑规则[\s\S]*<Trash2 className="h-4 w-4" \/>[\s\S]*删除规则[\s\S]*<\/MobileRecordActions>/,
  "Announcement rule mobile actions should show clear edit and delete labels");
assert.match(announcementsSource, /<MobileRecordActions>[\s\S]*<Pencil className="h-4 w-4" \/>[\s\S]*编辑公告[\s\S]*<Trash2 className="h-4 w-4" \/>[\s\S]*删除公告[\s\S]*<\/MobileRecordActions>/,
  "Announcement mobile actions should show clear edit and delete labels");
assert.doesNotMatch(announcementsSource, /<div className="line-clamp-2">\{targetGroupLabel\(rule\.targetGroupIds \?\? \[\]\)\}<\/div>/,
  "Announcement mobile rule target groups should wrap instead of hiding group names behind a two-line clamp");
assert.doesNotMatch(announcementsSource, /<div className="line-clamp-3 break-words font-mono text-xs">\{rule\.titleTemplate\}<\/div>/,
  "Announcement mobile rule title templates should wrap instead of hiding long templates behind a clamp");
assert.doesNotMatch(announcementsSource, /<MobileRecordMeta className="line-clamp-2">\{announcement\.content\}<\/MobileRecordMeta>/,
  "Announcement mobile content previews should wrap instead of hiding content behind a two-line clamp");
assert.doesNotMatch(announcementsSource, /<MobileRecordTitle className="truncate">\{rule\.name\}<\/MobileRecordTitle>/,
  "Announcement mobile rule titles should wrap instead of truncating long rule names");
assert.doesNotMatch(announcementsSource, /<MobileRecordTitle className="truncate">\{announcement\.title\}<\/MobileRecordTitle>/,
  "Announcement mobile titles should wrap instead of truncating long announcement titles");
assert.match(announcementsSource, /<div className="whitespace-normal break-words text-sm leading-5 \[overflow-wrap:anywhere\]">\{targetGroupLabel\(rule\.targetGroupIds \?\? \[\]\)\}<\/div>/,
  "Announcement mobile rule target groups should wrap long group names");
assert.match(announcementsSource, /<div className="whitespace-normal break-words font-mono text-xs leading-5 \[overflow-wrap:anywhere\]">\{rule\.titleTemplate\}<\/div>/,
  "Announcement mobile rule title templates should wrap long templates");
assert.match(announcementsSource, /<MobileRecordMeta className="whitespace-normal break-words leading-5 \[overflow-wrap:anywhere\]">\{announcement\.content\}<\/MobileRecordMeta>/,
  "Announcement mobile content previews should wrap long content");
assert.match(announcementsSource, /<MobileRecordTitle className="whitespace-normal break-words leading-5 \[overflow-wrap:anywhere\]">\{rule\.name\}<\/MobileRecordTitle>/,
  "Announcement mobile rule titles should wrap long rule names");
assert.match(announcementsSource, /<MobileRecordTitle className="whitespace-normal break-words leading-5 \[overflow-wrap:anywhere\]">\{announcement\.title\}<\/MobileRecordTitle>/,
  "Announcement mobile titles should wrap long announcement titles");
assert.doesNotMatch(announcementsSource, /max-w-\[(?:220px|320px|460px)\] truncate/,
  "Announcement desktop tables should wrap rule targets, templates, titles, and content instead of truncating them");
assert.match(announcementsSource, /className="max-w-\[260px\] whitespace-normal break-words text-sm leading-5 text-muted-foreground \[overflow-wrap:anywhere\]"/,
  "Announcement rule target groups should wrap in the desktop table");
assert.match(announcementsSource, /className="max-w-\[360px\] whitespace-normal break-words font-mono text-xs leading-5 \[overflow-wrap:anywhere\]"/,
  "Announcement rule title templates should wrap in the desktop table");
assert.match(announcementsSource, /className="max-w-\[520px\] whitespace-normal break-words font-medium leading-5 \[overflow-wrap:anywhere\]"/,
  "Announcement titles should wrap in the desktop table");
assert.match(announcementsSource, /className="mt-1 max-w-\[520px\] whitespace-normal break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]"/,
  "Announcement content previews should wrap in the desktop table");
assert.doesNotMatch(announcementsSource, /<div className="p-4 text-sm text-muted-foreground">加载分组中\.\.\.<\/div>/,
  "Announcement group selectors should not use hand-written loading text");
assert.doesNotMatch(announcementsSource, /<div className="p-4 text-sm text-muted-foreground">没有匹配的分组<\/div>/,
  "Announcement group selectors should not use hand-written no-result text");
assert.doesNotMatch(announcementsSource, /confirm\(/, "Announcement destructive actions should not use the browser confirm dialog");
assert.match(announcementsSource, /ConfirmDialog/, "Announcement destructive actions should use the in-app confirmation dialog");
assert.doesNotMatch(announcementsSource, /grid gap-4 sm:grid-cols-\[1fr_auto\]/,
  "Announcement rule name and enable controls should not compress into an input-plus-auto row at the small breakpoint");
assert.match(announcementsSource, /grid gap-4 lg:grid-cols-\[1fr_auto\]/,
  "Announcement rule name and enable controls should wait until the large breakpoint before pairing controls");
assert.doesNotMatch(announcementsSource, /grid gap-4 sm:grid-cols-2/,
  "Announcement dialog field groups should not split into two cramped columns at the small breakpoint");
assert.match(announcementsSource, /grid gap-4 lg:grid-cols-2/,
  "Announcement dialog field groups should wait until the large breakpoint for two-column layouts");
assert.doesNotMatch(announcementsSource, /flex h-9 items-center gap-3 rounded-md border border-border\/70 px-3/,
  "Announcement rule enable switch should not use a short fixed-height container on touch layouts");
assert.match(announcementsSource, /flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border\/70 px-3 lg:w-auto lg:justify-start/,
  "Announcement rule enable switch should keep a full-width touch-friendly container until large screens");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-name">规则名称<\/Label>[\s\S]*<Input[\s\S]*id="announcement-rule-name"/,
  "Announcement rule name input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-status">发布状态<\/Label>[\s\S]*<SelectTrigger id="announcement-rule-status">/,
  "Announcement rule status select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-notify-mode">通知方式<\/Label>[\s\S]*<SelectTrigger id="announcement-rule-notify-mode">/,
  "Announcement rule notify mode select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-group-search">适用分组<\/Label>[\s\S]*<Input[\s\S]*id="announcement-rule-group-search"[\s\S]*type="search"/,
  "Announcement rule group search should use search semantics and be associated with its visible label");
assert.match(announcementsSource, /const checkboxId = `announcement-rule-group-\$\{group\.id\}`;[\s\S]*<label key=\{group\.id\} htmlFor=\{checkboxId\}[\s\S]*<Checkbox[\s\S]*id=\{checkboxId\}/,
  "Announcement rule group checkboxes should be associated with their row labels");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-title-template">标题模板<\/Label>[\s\S]*<Input[\s\S]*id="announcement-rule-title-template"/,
  "Announcement rule title template input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-rule-content-template">内容模板<\/Label>[\s\S]*<Textarea[\s\S]*id="announcement-rule-content-template"/,
  "Announcement rule content template textarea should be associated with its visible label");
assert.doesNotMatch(announcementsSource, /<Label>可用变量<\/Label>/,
  "Announcement rule variable chips should use non-form section text instead of an unbound Label");
assert.doesNotMatch(announcementsSource, /<Label>预览<\/Label>/,
  "Announcement rule preview should use non-form section text instead of an unbound Label");
assert.match(announcementsSource, /<Label htmlFor="announcement-title">标题<\/Label>[\s\S]*<Input[\s\S]*id="announcement-title"/,
  "Announcement editor title input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-status">状态<\/Label>[\s\S]*<SelectTrigger id="announcement-status">/,
  "Announcement editor status select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-notify-mode">通知方式<\/Label>[\s\S]*<SelectTrigger id="announcement-notify-mode">/,
  "Announcement editor notify mode select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-starts-at">开始展示时间<\/Label>[\s\S]*<Input[\s\S]*id="announcement-starts-at"/,
  "Announcement editor start time input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-ends-at">结束展示时间<\/Label>[\s\S]*<Input[\s\S]*id="announcement-ends-at"/,
  "Announcement editor end time input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-content">内容<\/Label>[\s\S]*<Textarea[\s\S]*id="announcement-content"/,
  "Announcement editor content textarea should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-status">状态<\/Label>[\s\S]*<SelectTrigger id="announcement-bulk-status">/,
  "Announcement bulk status select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-notify-mode">展示方式<\/Label>[\s\S]*<SelectTrigger id="announcement-bulk-notify-mode">/,
  "Announcement bulk notify mode select should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-starts-at">开始展示时间<\/Label>[\s\S]*<Input[\s\S]*id="announcement-bulk-starts-at"/,
  "Announcement bulk start time input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-clear-starts-at"[\s\S]*<Checkbox[\s\S]*id="announcement-bulk-clear-starts-at"[\s\S]*清空开始时间/,
  "Announcement bulk clear start checkbox should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-ends-at">结束展示时间<\/Label>[\s\S]*<Input[\s\S]*id="announcement-bulk-ends-at"/,
  "Announcement bulk end time input should be associated with its visible label");
assert.match(announcementsSource, /<Label htmlFor="announcement-bulk-clear-ends-at"[\s\S]*<Checkbox[\s\S]*id="announcement-bulk-clear-ends-at"[\s\S]*清空结束时间/,
  "Announcement bulk clear end checkbox should be associated with its visible label");
assert.match(accountsSource, /FilterToolbar/, "Accounts panel should use the shared filter toolbar");
assert.match(accountsSource, /<FilterField label="查找账号" htmlFor="account-search">[\s\S]*<FilterSearchField[\s\S]*id="account-search"[\s\S]*type="search"/,
  "Accounts search filter should use search semantics and be associated with its visible label");
assert.match(accountsSource, /<FilterField label="平台筛选" htmlFor="account-platform-filter">[\s\S]*<SelectTrigger id="account-platform-filter">/,
  "Accounts platform filter should be associated with its visible label");
assert.doesNotMatch(accountsSource, /<PanelActions className="sm:max-w-\[640px\]">/,
  "Accounts header actions should not cap the shared action layout at the small breakpoint");
assert.match(accountsSource, /LoadingState/, "Accounts panel page loading should use the shared loading state");
assert.match(accountsSource, /ErrorState title="加载账号失败"/, "Accounts list errors should use the shared error state");
assert.match(accountsSource, /ErrorState title="加载采集生效倍率失败"/, "Account rate loading errors should use the shared error state");
assert.match(accountsSource, /ErrorState title="加载余额预警配置失败"/, "Account balance threshold errors should use the shared error state");
assert.match(accountsSource, /ErrorState title="加载余额 Webhook 配置失败"/, "Account balance webhook errors should use the shared error state");
assert.doesNotMatch(accountsSource, /<p className="text-sm text-destructive">加载账号失败：\{error\.message\}<\/p>/,
  "Accounts list errors should not render as bare destructive text");
assert.match(accountsSource, /InlineError/, "Account dialogs should use the shared inline error state");
assert.doesNotMatch(accountsSource, /<div className="flex flex-col gap-2 rounded-md border border-destructive\/20 bg-destructive\/8 px-3 py-2 text-sm text-destructive lg:flex-row lg:items-center lg:justify-between">/,
  "Account low-balance warning should use the shared inline error state instead of a hand-written destructive block");
assert.match(accountsSource, /<InlineError className="lg:flex-row lg:items-center lg:justify-between">[\s\S]*有 \{lowBalanceAccounts\.length\} 个账号余额低于预警阈值/,
  "Account low-balance warning should keep its structured account details inside InlineError");
assert.doesNotMatch(accountsSource, /<span key=\{account\.id\} className="max-w-\[240px\] truncate">/,
  "Account low-balance warning account details should wrap instead of truncating account names and balances");
assert.match(accountsSource, /<span key=\{account\.id\} className="max-w-full whitespace-normal break-words leading-5 \[overflow-wrap:anywhere\]">/,
  "Account low-balance warning account details should preserve long account names and balances");
assert.match(accountsSource, /<Label htmlFor="account-balance-webhook-enabled"[\s\S]*>启用预警<\/Label>[\s\S]*<Switch[\s\S]*id="account-balance-webhook-enabled"/,
  "Account balance webhook enabled switch should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-balance-webhook-url">Webhook URL<\/Label>[\s\S]*<Input[\s\S]*id="account-balance-webhook-url"[\s\S]*type="url"[\s\S]*autoComplete="url"/,
  "Account balance webhook URL input should use URL semantics and be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-balance-webhook-cooldown">冷却分钟<\/Label>[\s\S]*<Input[\s\S]*id="account-balance-webhook-cooldown"/,
  "Account balance webhook cooldown input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-balance-webhook-template">消息模板<\/Label>[\s\S]*<Textarea[\s\S]*id="account-balance-webhook-template"/,
  "Account balance webhook template textarea should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-priority-rule-enabled"[\s\S]*>启用规则<\/Label>[\s\S]*<Switch[\s\S]*id="account-priority-rule-enabled"/,
  "Account priority rule enabled switch should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-priority-rule-search">目标 Sub2API 分组<\/Label>[\s\S]*<Input[\s\S]*id="account-priority-rule-search"[\s\S]*type="search"/,
  "Account priority rule group search should use search semantics and be associated with its visible label");
assert.doesNotMatch(accountsSource, /className="h-7 gap-1 px-2 text-xs"/,
  "Account filter reset should not override shared touch-friendly button sizing");
assert.doesNotMatch(accountsSource, /<span className="block truncate font-medium">\{getGroupLabel\(group\)\}<\/span>/,
  "Account group selector rows should wrap long group names instead of truncating them");
assert.doesNotMatch(accountsSource, /<span className="block truncate text-xs text-muted-foreground">#\{group\.id\}\{group\.platform \? ` \/ \$\{group\.platform\}` : ""\}<\/span>/,
  "Account group selector rows should wrap long group metadata instead of truncating platform identifiers");
assert.match(accountsSource, /<span className="block whitespace-normal break-words font-medium leading-5 \[overflow-wrap:anywhere\]">\{getGroupLabel\(group\)\}<\/span>/,
  "Account group selector rows should show long group names with readable wrapping");
assert.match(accountsSource, /<span className="block whitespace-normal break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]">#\{group\.id\}\{group\.platform \? ` \/ \$\{group\.platform\}` : ""\}<\/span>/,
  "Account group selector rows should show long group metadata with readable wrapping");
assert.match(accountsSource, /<Label htmlFor="account-name">账号名称<\/Label>[\s\S]*<Input[\s\S]*id="account-name"/,
  "Account editor name input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-platform">平台<\/Label>[\s\S]*<Input[\s\S]*id="account-platform"/,
  "Account editor platform input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-type">类型<\/Label>[\s\S]*<SelectTrigger id="account-type">/,
  "Account editor type select should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-status">状态<\/Label>[\s\S]*<SelectTrigger id="account-status">/,
  "Account editor status select should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-notes">备注<\/Label>[\s\S]*<Textarea[\s\S]*id="account-notes"/,
  "Account editor notes textarea should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-rate-multiplier">账号倍率<\/Label>[\s\S]*<Input[\s\S]*id="account-rate-multiplier"/,
  "Account editor rate multiplier input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-proxy-id">代理 ID<\/Label>[\s\S]*<Input[\s\S]*id="account-proxy-id"/,
  "Account editor proxy ID input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-concurrency">并发数<\/Label>[\s\S]*<Input[\s\S]*id="account-concurrency"/,
  "Account editor concurrency input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-priority">优先级<\/Label>[\s\S]*<Input[\s\S]*id="account-priority"/,
  "Account editor priority input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-load-factor">负载权重<\/Label>[\s\S]*<Input[\s\S]*id="account-load-factor"/,
  "Account editor load factor input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-expires-at">过期时间<\/Label>[\s\S]*<Input[\s\S]*id="account-expires-at"/,
  "Account editor expiry input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-api-key">API Key<\/Label>[\s\S]*<PasswordInput[\s\S]*id="account-api-key"[\s\S]*autoComplete="new-password"/,
  "Account editor API key input should be associated with its visible label and keep secret autocomplete semantics");
assert.match(accountsSource, /<Label htmlFor="account-base-url">Base URL<\/Label>[\s\S]*<Input[\s\S]*id="account-base-url"[\s\S]*type="url"[\s\S]*autoComplete="url"/,
  "Account editor base URL input should use URL semantics and be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-credentials-json">Credentials JSON<\/Label>[\s\S]*<Textarea[\s\S]*id="account-credentials-json"/,
  "Account editor credentials JSON textarea should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-extra-json">Extra JSON<\/Label>[\s\S]*<Textarea[\s\S]*id="account-extra-json"/,
  "Account editor extra JSON textarea should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-group-search">Sub2API 分组<\/Label>[\s\S]*<Input[\s\S]*id="account-group-search"[\s\S]*type="search"/,
  "Account editor Sub2API group search should use search semantics and be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-rate-rule-mode">倍率规则<\/Label>[\s\S]*<SelectTrigger id="account-rate-rule-mode">/,
  "Account editor rate rule mode select should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-rate-rule-expression">自定义公式<\/Label>[\s\S]*<Textarea[\s\S]*id="account-rate-rule-expression"/,
  "Account editor custom rate rule expression should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-rate-rule-offset">偏移<\/Label>[\s\S]*<Input[\s\S]*id="account-rate-rule-offset"/,
  "Account editor rate rule offset input should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-test-model">测试模型<\/Label>[\s\S]*<SelectTrigger id="account-test-model">/,
  "Account test dialog model select should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-test-model">测试模型<\/Label>[\s\S]*<Input[\s\S]*id="account-test-model"/,
  "Account test dialog manual model input should share the visible model label");
assert.match(accountsSource, /<Label htmlFor="account-test-mode">测试模式<\/Label>[\s\S]*<SelectTrigger id="account-test-mode">/,
  "Account test dialog mode select should be associated with its visible label");
assert.match(accountsSource, /<Label htmlFor="account-test-image-prompt">图片 Prompt<\/Label>[\s\S]*<Textarea[\s\S]*id="account-test-image-prompt"/,
  "Account test dialog image prompt textarea should be associated with its visible label");
assert.doesNotMatch(accountsSource, /<p className="text-sm text-destructive">\{formError\}<\/p>/,
  "Account form errors should not render as bare destructive text");
assert.doesNotMatch(accountsSource, /<p className="text-sm text-destructive">加载模型失败：\{testAccountModels\.error\.message\}<\/p>/,
  "Account model loading errors should not render as bare destructive text");
assert.doesNotMatch(accountsSource, /<p className="text-sm text-destructive">\{deleteError\}<\/p>/,
  "Account delete errors should not render as bare destructive text");
assert.doesNotMatch(accountsSource, /return <div className="flex items-center gap-2 text-muted-foreground">/, "Accounts panel should not use a hand-written page loading block");
assert.match(accountsSource, /EmptyState/, "Account group selectors should use shared empty feedback");
assert.match(accountsSource, /EmptyState title="暂无账号"/,
  "Accounts mobile list empty feedback should use the shared empty state");
assert.match(accountsSource, /EmptyState title="没有匹配的账号"/,
  "Accounts mobile list no-result feedback should use the shared empty state");
assert.doesNotMatch(accountsSource, /<MobileRecordEmpty>/,
  "Accounts mobile list feedback should not use hand-written MobileRecordEmpty rows");
assert.doesNotMatch(accountsSource, /<Button variant="outline" size="icon"/,
  "Accounts mobile record actions should use visible text labels instead of icon-only buttons");
const accountMobileActionsSource = accountsSource.match(/<MobileRecordActions>[\s\S]*?<\/MobileRecordActions>/)?.[0] ?? "";
assert.match(accountMobileActionsSource, /<Pencil className="h-4 w-4" \/>[\s\S]*编辑账号/,
  "Accounts mobile edit action should show a clear text label");
assert.match(accountMobileActionsSource, /<Play className="h-4 w-4" \/>[\s\S]*应用规则/,
  "Accounts mobile apply-rule action should show a clear text label");
assert.match(accountMobileActionsSource, /<CirclePlay className="h-4 w-4 text-blue-500" \/>[\s\S]*测试账号/,
  "Accounts mobile test action should show a clear text label");
assert.match(accountMobileActionsSource, /<Power className=\{`h-4 w-4 \$\{schedulable \? "text-green-500" : "text-muted-foreground"\}`\} \/>[\s\S]*禁用调度[\s\S]*启用调度/,
  "Accounts mobile schedule toggle should show clear enable and disable labels");
assert.match(accountMobileActionsSource, /<AlertTriangle className="h-4 w-4 text-orange-500" \/>[\s\S]*清除错误/,
  "Accounts mobile clear-error action should show a clear text label");
assert.match(accountMobileActionsSource, /<RotateCcw className="h-4 w-4" \/>[\s\S]*刷新凭证/,
  "Accounts mobile credential refresh action should show a clear text label");
assert.match(accountMobileActionsSource, /<Trash2 className="h-4 w-4" \/>[\s\S]*删除账号/,
  "Accounts mobile delete action should show a clear text label");
assert.doesNotMatch(accountsSource, /<div className="p-4 text-sm text-muted-foreground">暂无可选分组<\/div>/,
  "Account group selectors should not use hand-written empty text");
assert.doesNotMatch(accountsSource, /<div className="p-4 text-sm text-muted-foreground">没有匹配的分组<\/div>/,
  "Account group selectors should not use hand-written no-result text");
assert.doesNotMatch(accountsSource, /confirm\(/, "Account sensitive actions should not use the browser confirm dialog");
assert.match(accountsSource, /ConfirmDialog/, "Account sensitive actions should use the in-app confirmation dialog");
assert.doesNotMatch(accountsSource, /<Dialog open=\{!!deleteAccount\}/, "Account deletion should use the shared confirmation dialog instead of a hand-written dialog");
assert.match(accountsSource, /title="删除账号"[\s\S]*error=\{deleteError\}/, "Account deletion confirmation should surface mutation errors through ConfirmDialog");
assert.doesNotMatch(accountsSource, /grid gap-3 sm:grid-cols-2/,
  "Account dialogs should not split related fields into two cramped columns at the small breakpoint");
assert.doesNotMatch(accountsSource, /grid gap-3 sm:grid-cols-3/,
  "Account dialogs should not split numeric controls into three cramped columns at the small breakpoint");
assert.match(accountsSource, /grid gap-3 lg:grid-cols-2/,
  "Account dialogs should wait until the large breakpoint for two-column field groups");
assert.match(accountsSource, /grid gap-3 lg:grid-cols-3/,
  "Account dialogs should wait until the large breakpoint for three-column numeric controls");
assert.match(announcementsSource, /TableActionHead className="w-24"/, "Announcement desktop tables should keep operation columns visible while horizontally scrolling");
assert.match(announcementsSource, /<TableActionCell>/, "Announcement rows should use the shared sticky operation cell");
assert.match(accountsSource, /TableActionHead className="w-64"/, "Accounts desktop table should keep the operation column visible while horizontally scrolling");
assert.match(accountsSource, /<TableActionCell>/, "Account rows should use the shared sticky operation cell");
assert.match(groupPanelSource, /TableActionHead className="w-32"/, "Groups desktop table should keep the operation column visible while horizontally scrolling");
assert.match(groupPanelSource, /<TableActionCell>/, "Group rows should use the shared sticky operation cell");
assert.match(blSourceBindingsSource, /FilterToolbar/, "BL source binding selector should use the shared filter toolbar");
assert.match(blSourceBindingsSource, /FilterField/, "BL source binding selector filters should use shared labeled fields");
assert.match(blSourceBindingsSource, /FilterSummary/, "BL source binding selector should use the shared filter summary");
assert.match(blSourceBindingsSource, /<FilterField label="查找源分组" htmlFor="bl-source-search"[\s\S]*<FilterSearchField[\s\S]*id="bl-source-search"[\s\S]*type="search"/,
  "BL source binding search should use search semantics and be associated with its visible label");
assert.match(blSourceBindingsSource, /<FilterField label="源站" htmlFor="bl-source-site-filter">[\s\S]*<SelectTrigger id="bl-source-site-filter">/,
  "BL source binding site filter should be associated with its visible label");
assert.match(blSourceBindingsSource, /<FilterField label="平台" htmlFor="bl-source-platform-filter">[\s\S]*<SelectTrigger id="bl-source-platform-filter">/,
  "BL source binding platform filter should be associated with its visible label");
assert.match(blSourceBindingsSource, /<FilterField label="选择状态" htmlFor="bl-source-selection-filter">[\s\S]*<SelectTrigger id="bl-source-selection-filter">/,
  "BL source binding selection filter should be associated with its visible label");
assert.match(blSourceBindingsSource, /<FilterField label="排序" htmlFor="bl-source-sort">[\s\S]*<SelectTrigger id="bl-source-sort">/,
  "BL source binding sort filter should be associated with its visible label");
assert.match(blSourceBindingsSource, /LoadingState/, "BL source binding selector should use shared loading feedback");
assert.match(blSourceBindingsSource, /EmptyState/, "BL source binding selector should use shared empty feedback");
assert.doesNotMatch(blSourceBindingsSource, /<span className="block truncate font-medium">\{rate\.name \|\| rate\.group_id\}<\/span>/,
  "BL source binding candidate rows should wrap long source group names instead of truncating them");
assert.doesNotMatch(blSourceBindingsSource, /<span className="block truncate text-xs text-muted-foreground">/,
  "BL source binding candidate rows should wrap long source-site/platform details instead of truncating them");
assert.match(blSourceBindingsSource, /<span className="min-w-0 whitespace-normal break-words text-\[11px\] leading-4 text-muted-foreground \[overflow-wrap:anywhere\]">[\s\S]*\{binding\.sourceSiteName\}[\s\S]*<\/span>/,
  "BL source binding selected chips should wrap long source-site names");
assert.match(blSourceBindingsSource, /<span className="min-w-0 whitespace-normal break-words font-medium leading-5 \[overflow-wrap:anywhere\]">\{getSourceLabel\(binding\)\}<\/span>/,
  "BL source binding selected chips should wrap long source group names");
assert.match(blSourceBindingsSource, /<span className="block whitespace-normal break-words font-medium leading-5 \[overflow-wrap:anywhere\]">\{rate\.name \|\| rate\.group_id\}<\/span>/,
  "BL source binding candidate rows should wrap long source group names");
assert.match(blSourceBindingsSource, /<span className="block whitespace-normal break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]">/,
  "BL source binding candidate rows should wrap long source-site and platform details");
assert.match(appSettingsSource, /PanelActions/, "App settings header/actions should use the shared action wrapper");
assert.match(appSettingsSource, /LoadingState/, "App settings should use shared loading feedback");
assert.match(appSettingsSource, /EmptyState/, "App settings admin list should use shared empty feedback");
assert.match(appSettingsSource, /ErrorState title="保存 Worker 配置失败"/, "App settings worker errors should use the shared error state");
assert.match(appSettingsSource, /ErrorState title="更新管理员失败"/, "App settings admin errors should use the shared error state");
assert.doesNotMatch(appSettingsSource, /<p className="truncate text-sm font-medium">\{user\.email\}<\/p>/,
  "App settings admin emails should wrap instead of truncating long identities");
assert.match(appSettingsSource, /<p className="whitespace-normal break-all text-sm font-medium leading-5 \[overflow-wrap:anywhere\]">\{user\.email\}<\/p>/,
  "App settings admin emails should preserve long identities with readable wrapping");
assert.doesNotMatch(appSettingsSource, /<p className="text-sm text-destructive">\{workerError\}<\/p>/,
  "App settings worker errors should not render as bare destructive text");
assert.doesNotMatch(appSettingsSource, /<p className="text-sm text-destructive">\{error\}<\/p>/,
  "App settings admin errors should not render as bare destructive text");
assert.doesNotMatch(appSettingsSource, /confirm\(/, "App settings destructive admin actions should not use the browser confirm dialog");
assert.match(appSettingsSource, /ConfirmDialog/, "App settings destructive admin actions should use the in-app confirmation dialog");
assert.doesNotMatch(appSettingsSource, /grid gap-4 md:grid-cols-3/,
  "App settings worker fields should not become three cramped columns at the narrow tablet breakpoint");
assert.match(appSettingsSource, /grid gap-4 lg:grid-cols-3/,
  "App settings worker fields should wait until the large breakpoint for three-column layout");
assert.doesNotMatch(appSettingsSource, /flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between/,
  "App settings admin rows should keep destructive actions below account details through narrow tablets");
assert.match(appSettingsSource, /flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between/,
  "App settings admin rows should only place destructive actions beside account details on large screens");
assert.doesNotMatch(appSettingsSource, /className="w-full text-destructive hover:text-destructive sm:w-auto"/,
  "App settings admin delete buttons should not shrink at the small breakpoint");
assert.match(appSettingsSource, /className="w-full text-destructive hover:text-destructive lg:w-auto"/,
  "App settings admin delete buttons should remain full-width until large screens");
assert.doesNotMatch(appSettingsSource, /grid gap-2 border-t pt-4 sm:grid-cols-\[1fr_1fr_auto\]/,
  "App settings add-admin form should not place the submit action beside inputs at the small breakpoint");
assert.match(appSettingsSource, /grid gap-2 border-t pt-4 lg:grid-cols-\[1fr_1fr_auto\]/,
  "App settings add-admin form should wait until the large breakpoint for inline submit layout");
assert.match(appSettingsSource, /className="w-full lg:w-auto lg:self-end"[\s\S]*\{addUser\.isPending \? "添加中\.\.\." : "添加"\}/,
  "App settings add-admin submit button should remain a full-width touch target until large screens");
assert.match(appSettingsSource, /<Button className="w-full lg:w-auto" onClick=\{handleSaveWorker\}/,
  "App settings worker save action should stay full-width on phones and narrow tablets");
assert.match(appSettingsSource, /saveWorker\.isPending \? <Loader2 className="size-4 animate-spin" \/> : <Save className="size-4" \/>/,
  "App settings worker save action should show a stable loading icon instead of changing layout with text only");
assert.match(appSettingsSource, /<Label htmlFor="admin-email">管理员邮箱<\/Label>[\s\S]*<Input id="admin-email" autoComplete="email"/,
  "App settings add-admin email field should have a visible label and browser autofill support");
assert.match(appSettingsSource, /<Label htmlFor="admin-password">管理员密码<\/Label>[\s\S]*<PasswordInput id="admin-password" autoComplete="new-password"/,
  "App settings add-admin password field should have a visible label and new-password autofill support");
assert.match(appSettingsSource, /<Label htmlFor="worker-interval-minutes">Worker 运行间隔（分钟）<\/Label>[\s\S]*<Input[\s\S]*id="worker-interval-minutes"/,
  "App settings worker interval input should be associated with its visible label");
assert.match(appSettingsSource, /<Label htmlFor="upstream-monitor-timeout-seconds">上游检测超时（秒）<\/Label>[\s\S]*<Input[\s\S]*id="upstream-monitor-timeout-seconds"/,
  "App settings monitor timeout input should be associated with its visible label");
assert.match(appSettingsSource, /<Label htmlFor="upstream-monitor-concurrency">上游检测并发数<\/Label>[\s\S]*<Input[\s\S]*id="upstream-monitor-concurrency"/,
  "App settings monitor concurrency input should be associated with its visible label");

const tableEmptyRowPanels = [
  ["logs", logsSource],
  ["groups", groupPanelSource],
  ["announcements", announcementsSource],
  ["accounts", accountsSource],
  ["service status", serviceStatusSource],
  ["upstream monitor", upstreamMonitorSource],
] as const;
for (const [name, source] of tableEmptyRowPanels) {
  assert.match(source, /TableEmptyRow/, `${name} panel should use the shared table empty row`);
}

for (const [name, source] of [
  ["groups", groupPanelSource],
  ["announcements", announcementsSource],
  ["accounts", accountsSource],
] as const) {
  assert.match(source, /DialogBody/, `${name} long-form dialogs should use the shared dialog body`);
}

assert.doesNotMatch(accountsSource, /h-\[90vh\]|max-h-\[90vh\]/, "Account dialogs should avoid fixed 90vh heights on mobile");
assert.match(accountsSource, /max-h-\[min\(92dvh,720px\)\] max-w-5xl/, "Account editor dialog should use a dynamic viewport height cap");
assert.match(accountsSource, /<DialogTitle>\{formMode === "create" \? "新增账号" : "编辑账号"\}<\/DialogTitle>[\s\S]*<DialogBody className="flex-1 space-y-4 py-5"/,
  "Account editor form content should live in a scrollable dialog body");
assert.match(accountsSource, /<Dialog open=\{!!testDialog\}[\s\S]*<DialogContent className="flex max-h-\[min\(92dvh,640px\)\] max-w-lg flex-col gap-0 overflow-hidden p-0">/,
  "Account test dialog should use a compact dynamic viewport height cap");
assert.match(accountsSource, /<DialogTitle>测试账号<\/DialogTitle>[\s\S]*<DialogBody className="flex-1 space-y-4 py-5">/,
  "Account test dialog content should live in a shared scrollable dialog body");
assert.match(accountsSource, /<DialogTitle>测试账号<\/DialogTitle>[\s\S]*<DialogFooter className="shrink-0 border-t border-border\/70 px-4 py-4 sm:px-6">/,
  "Account test dialog actions should remain fixed below the scrollable body");
assert.doesNotMatch(accountsSource, /Dialog(?:Header|Footer) className="[^"]*\bpx-6 py-4"/,
  "Account dialog chrome should use px-4 on mobile and reserve px-6 for wider screens");

assert.match(shellSource, /LoadingState/, "Shell connection lists should use the shared loading state");
assert.match(shellSource, /EmptyState/, "Shell connection lists should use the shared empty state");
assert.match(shellSource, /DialogBody/, "Shell connection form should use the shared scrollable dialog body");
assert.match(shellSource, /max-h-\[min\(92dvh,720px\)\]/, "Shell connection dialog should fit small viewports");
assert.match(shellSource, /DialogContent className="flex max-h-\[min\(92dvh,720px\)\] flex-col gap-0 overflow-hidden p-0"/,
  "Shell connection dialog should use a stable vertical dialog layout");
assert.match(shellSource, /DialogHeader className="shrink-0 border-b border-border\/60 px-4 py-4 sm:px-6"/,
  "Shell connection form should keep its header fixed and visually separated");
assert.match(shellSource, /DialogBody className="flex-1 space-y-4 py-5"/,
  "Shell connection form fields should use the shared scrollable body spacing");
assert.match(shellSource, /DialogFooter className="shrink-0 border-t border-border\/70 px-4 py-4 sm:px-6"/,
  "Shell connection form actions should remain fixed below the scrollable body");
assert.match(shellSource, /<Label htmlFor="connection-sync-mode">同步策略<\/Label>[\s\S]*<SelectTrigger id="connection-sync-mode">/,
  "Shell connection sync mode select should be associated with its visible label");
assert.match(shellSource, /InlineError/, "Shell connection form errors should use the shared inline error state");
assert.doesNotMatch(shellSource, /<p className="rounded-md border border-destructive\/25 bg-destructive\/10 px-3 py-2 text-sm text-destructive">\{error\}<\/p>/,
  "Shell connection form errors should not render as a hand-written destructive paragraph");
assert.equal(existsSync(confirmDialogPath), true, "Destructive operations should use a reusable in-app confirmation dialog");
const confirmDialogSource = existsSync(confirmDialogPath) ? readFileSync(confirmDialogPath, "utf8") : "";
assert.match(confirmDialogSource, /DialogDescription/, "Confirmation dialogs should include descriptive context");
assert.match(confirmDialogSource, /variant="destructive"/, "Confirmation dialogs should make destructive actions visually explicit");
assert.match(confirmDialogSource, /error\?: ReactNode/, "ConfirmDialog should support inline mutation errors");
assert.match(confirmDialogSource, /description: ReactNode/, "Confirmation dialogs should support structured or multi-line context");
assert.match(confirmDialogSource, /InlineError/, "ConfirmDialog mutation errors should use the shared inline error state");
assert.match(confirmDialogSource, /DialogContent className="flex max-h-\[min\(92dvh,520px\)\] max-w-md flex-col gap-0 overflow-hidden p-0"/,
  "Confirmation dialogs should cap height and keep content vertically structured on small screens");
assert.match(confirmDialogSource, /DialogHeader className="shrink-0 border-b border-border\/60 px-4 py-4 sm:px-6"/,
  "Confirmation dialogs should keep header content visually separated");
assert.match(confirmDialogSource, /DialogFooter className="shrink-0 border-t border-border\/70 px-4 py-4 sm:px-6"/,
  "Confirmation dialogs should keep actions fixed below any inline error content");
assert.doesNotMatch(shellSource, /confirm\(/, "Shell connection deletion should not use the browser confirm dialog");
assert.match(shellSource, /ConfirmDialog/, "Shell connection deletion should use the in-app confirmation dialog");
assert.doesNotMatch(shellSource, /role="button"/, "Connection cards should use native buttons instead of role=button containers");
assert.match(shellSource, /aria-pressed=\{active\}/, "Connection selection should expose its pressed state semantically");
assert.match(shellSource, /aria-label=\{`选择连接 \$\{connection\.name\}`\}/, "Connection selection buttons should expose a readable label");
assert.doesNotMatch(shellSource, /md:opacity-0 md:transition-opacity md:group-hover:opacity-100/,
  "Shell connection card actions should not depend on hover-only visibility");
assert.match(shellSource, /"mt-3 flex flex-wrap gap-2"/,
  "Shell connection card actions should keep at least 8px spacing between touch targets");
assert.doesNotMatch(shellSource, /className=\{cn\("h-7 px-2/,
  "Shell connection card action buttons should not force a smaller visual height than the shared button sizing");
assert.doesNotMatch(shellSource, /\{!selected \|\| showAppSettings \? \(/, "Shell mobile header should remain available after a connection is selected");
assert.match(shellSource, /renderConnectionCard\(connection, true\)/, "Shell mobile header should render compact connection cards for switching sites");
assert.match(shellSource, /<aside className="hidden [^"]*\blg:flex\b/, "Shell connection sidebar should wait until the large breakpoint to preserve narrow tablet content width");
assert.match(shellSource, /<header className="hidden [^"]*\blg:block\b/, "Shell desktop header should wait until the large breakpoint");
assert.match(shellSource, /<div className="shrink-0 [^"]*\blg:hidden\b" data-motion="header">/, "Shell mobile header should remain available through narrow tablets");
assert.doesNotMatch(shellSource, /\bmd:(?:flex|block|hidden)\b/, "Shell chrome should not switch layout at the narrow tablet breakpoint");
assert.doesNotMatch(shellSource, /className="size-8"/,
  "Shell mobile header actions should not override icon buttons down to 32px touch targets");
assert.match(shellSource, /<ThemeToggle \/>\s*<Button variant=\{showAppSettings \? "secondary" : "ghost"\} size="icon" onClick=\{\(\) => setShowAppSettings/,
  "Shell mobile header actions should rely on the shared icon button touch target sizing");
assert.match(shellSource, /grid-cols-3/, "Shell mobile tab navigation should expose tabs in a scannable grid");
assert.match(shellSource, /min-\[560px\]:grid-cols-5/, "Shell tab navigation should keep a wrapping grid on landscape phones");
assert.match(shellSource, /min-\[1400px\]:flex min-\[1400px\]:overflow-x-auto/, "Shell tab navigation should only switch to a dense strip when the sidebar leaves enough content width");
assert.doesNotMatch(shellSource, /sm:flex sm:overflow-x-auto/, "Shell tab navigation should not introduce horizontal scroll on narrow tablet layouts");
assert.doesNotMatch(shellSource, /lg:flex lg:overflow-x-auto|xl:flex xl:overflow-x-auto/, "Shell tab navigation should not switch to a horizontal strip at cramped desktop widths");
assert.match(shellSource, /h-11 .*min-\[1400px\]:h-10/, "Shell tab buttons should keep 44px touch height until the wide desktop breakpoint");
assert.match(shellSource, /justify-center min-\[1400px\]:justify-start/, "Shell tab buttons should center labels in the narrow grid and align normally on wide screens");
assert.match(shellSource, /data-active=\{activeTab === tab\.id \? "true" : "false"\}/, "Shell tab buttons should expose an explicit active state for styling");
assert.match(shellSource, /aria-current=\{activeTab === tab\.id \? "page" : undefined\}/, "Shell tab buttons should expose the current section semantically");
assert.match(globalsSource, /\[data-motion="nav"\] button\[data-active="true"\]/, "Shell nav active styling should target explicit active state");
assert.doesNotMatch(globalsSource, /\[data-motion="nav"\] button\[class\*="bg-primary"\]/, "Shell nav active styling should not match hover bg-primary utility classes");

assert.equal(existsSync(authLayoutPath), true, "Login and setup pages should share a reusable auth layout");
const authLayoutSource = existsSync(authLayoutPath) ? readFileSync(authLayoutPath, "utf8") : "";
assert.match(authLayoutSource, /min-h-dvh/, "Auth layout should use dynamic viewport height on mobile");
assert.match(authLayoutSource, /id="main-content"[\s\S]*tabIndex=\{-1\}/,
  "Auth layout should expose the same focusable main-content target as the app shell");
assert.match(authLayoutSource, /max-w-5xl/, "Auth layout should provide a wider desktop composition instead of a narrow single card");
assert.match(authLayoutSource, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,400px\)\]/,
  "Auth layout should switch to a balanced two-column layout only on large screens");
assert.match(authLayoutSource, /<ThemeToggle \/>/, "Auth layout should keep theme switching available from the entry pages");
assert.match(authLayoutSource, /<ProjectPromoLinks className="mt-6" \/>/,
  "Auth layout should keep project links in the supporting information area on wide screens");
assert.match(authLayoutSource, /className="space-y-3 text-sm text-muted-foreground"/,
  "Auth layout should expose concise product benefits outside the form card");

for (const [name, source] of [
  ["login", loginSource],
  ["setup", setupSource],
] as const) {
  assert.match(source, /AuthLayout/, `${name} page should use the shared auth layout`);
  assert.doesNotMatch(source, /<ProjectPromoLinks stacked/, `${name} page should not repeat project links below a narrow form card`);
  assert.match(source, /Loader2/, `${name} submit button should show an icon while pending`);
  assert.match(source, /autoComplete="email"/, `${name} email field should support browser autofill`);
  assert.match(source, /InlineError/, `${name} page form errors should use the shared inline error state`);
  assert.doesNotMatch(source, /<p className="text-sm text-destructive">\{error\}<\/p>/,
    `${name} page form errors should not render as bare destructive text`);
}

assert.match(loginSource, /autoComplete="current-password"/, "Login password field should use current-password autocomplete");
assert.match(setupSource, /autoComplete="new-password"/, "Setup password field should use new-password autocomplete");

assert.match(authGuardSource, /LoadingState/, "Auth guard should use shared loading feedback");
assert.match(authGuardSource, /min-h-dvh/, "Auth guard loading screen should use dynamic viewport height");
assert.doesNotMatch(authGuardSource, /className="[^"]*\bh-screen\b/, "Auth guard should avoid fixed 100vh on mobile");
assert.match(groupPanelSource, /ErrorState title="加载分组失败"/, "Groups list errors should use the shared error state");
assert.match(groupPanelSource, /ErrorState title="加载采集生效倍率失败"/, "Groups rate loading errors should use the shared error state");
assert.doesNotMatch(groupPanelSource, /<p className="text-sm text-destructive \[overflow-wrap:anywhere\]">加载分组失败：\{listError\.message\}<\/p>/,
  "Groups list errors should not render as bare destructive text");
assert.match(groupPanelSource, /InlineError/, "Group dialogs should use the shared inline error state");
assert.doesNotMatch(groupPanelSource, /<p className="mt-5 text-sm text-destructive">\{formError\}<\/p>/,
  "Group form errors should not render as bare destructive text");
assert.doesNotMatch(groupPanelSource, /<p className="text-sm text-destructive">\{deleteError\}<\/p>/,
  "Group delete errors should not render as bare destructive text");
assert.doesNotMatch(groupPanelSource, /<Dialog open=\{!!deleteGroup\}/, "Group deletion should use the shared confirmation dialog instead of a hand-written dialog");
assert.match(groupPanelSource, /title="删除分组"[\s\S]*error=\{deleteError\}/, "Group deletion confirmation should surface mutation errors through ConfirmDialog");
assert.match(siteSettingsSource, /LoadingState/, "Site settings should use shared loading feedback");
assert.match(siteSettingsSource, /ErrorState title="保存站点设置失败"/, "Site settings errors should use the shared error state");
assert.doesNotMatch(siteSettingsSource, /<p className="text-sm text-destructive">\{error\}<\/p>/,
  "Site settings errors should not render as bare destructive text");
assert.match(siteSettingsSource, /PasswordInput/, "Site settings secret fields should use the shared password input");
assert.match(siteSettingsSource, /grid grid-cols-2/, "Site settings section navigation should show all sections in a mobile grid");
assert.match(siteSettingsSource, /min-\[1400px\]:flex min-\[1400px\]:overflow-x-auto/, "Site settings section navigation should only switch to a horizontal strip when there is enough content width");
assert.doesNotMatch(siteSettingsSource, /sm:flex sm:overflow-x-auto/, "Site settings section navigation should not scroll horizontally on narrow tablets");
assert.doesNotMatch(siteSettingsSource, /lg:flex lg:overflow-x-auto|xl:flex xl:overflow-x-auto/, "Site settings section navigation should not switch to a horizontal strip at cramped desktop widths");
assert.match(siteSettingsSource, /className="h-11 w-full justify-center min-\[1400px\]:h-8 min-\[1400px\]:w-auto"/, "Site settings section tabs should use the full narrow grid cell as a tap target");
assert.match(siteSettingsSource, /h-11 .*min-\[1400px\]:h-8/, "Site settings section tabs should keep 44px height until the wide desktop breakpoint");
assert.match(siteSettingsSource, /aria-current=\{activeTab === section\.key \? "page" : undefined\}/, "Site settings section tabs should expose the current section semantically");

assert.doesNotMatch(serviceStatusSource, /<CardContent className="grid gap-3 text-sm md:grid-cols-2">/,
  "Service status worker details should not split long status values at the narrow tablet breakpoint");
assert.match(serviceStatusSource, /<CardContent className="grid gap-3 text-sm lg:grid-cols-2">/,
  "Service status worker details should wait until the large breakpoint before using two columns");
assert.doesNotMatch(serviceStatusSource, /className="(?:mt-1 |max-w-\[360px\] )?truncate/,
  "Service status operational messages and errors should wrap instead of being truncated");
assert.match(serviceStatusSource, /className="mt-1 whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]"/,
  "Service status worker messages should preserve readable wrapping");
assert.match(serviceStatusSource, /className="break-words \[overflow-wrap:anywhere\]"/,
  "Service status cleanup connection errors should wrap long details");
assert.match(serviceStatusSource, /className="max-w-\[360px\] whitespace-normal break-words text-sm leading-5 text-muted-foreground \[overflow-wrap:anywhere\]"/,
  "Service status recent log errors should wrap inside the table cell");

assert.doesNotMatch(accountsSource, /className="h-(?:7 w-20|8 w-24) px-2 font-mono text-xs"/,
  "Account balance threshold inputs should not use narrow, hand-sized local dimensions");
const accountThresholdInputs = accountsSource.match(/className="min-h-11 min-w-\[7rem\] px-2 font-mono text-sm lg:min-h-8 lg:text-xs"/g) ?? [];
assert.equal(accountThresholdInputs.length, 2,
  "Account balance threshold inputs should use explicit touch-friendly sizing in both table and mobile records");
assert.doesNotMatch(accountsSource, /<TableCell className="max-w-\[220px\] truncate text-sm">\{ruleSummary\(rule\)\}<\/TableCell>/,
  "Account desktop rule summaries should wrap instead of truncating rate formulas");
assert.doesNotMatch(accountsSource, /<TableCell className="max-w-\[150px\] truncate text-sm text-destructive">\{row\.error \?\? row\.last_error \?\? row\.error_message \?\? "-"\}<\/TableCell>/,
  "Account desktop error diagnostics should wrap instead of truncating failures");
assert.doesNotMatch(accountsSource, /className="max-w-\[160px\] truncate text-xs text-muted-foreground"/,
  "Account desktop balance plan details should wrap instead of truncating provider labels");
assert.doesNotMatch(accountsSource, /className="mt-0\.5 max-w-\[220px\] truncate text-xs text-muted-foreground"/,
  "Account mobile balance plan names should wrap instead of truncating provider labels");
assert.doesNotMatch(accountsSource, /<span className="line-clamp-2">\{ruleSummary\(rule\)\}<\/span>/,
  "Account mobile rule summaries should not hide long formulas behind a two-line clamp");
assert.doesNotMatch(accountsSource, /<div className="line-clamp-3">\{errorText\}<\/div>/,
  "Account mobile error diagnostics should not hide recovery details behind a three-line clamp");
assert.match(accountsSource, /<TableCell className="max-w-\[260px\] whitespace-normal break-words text-sm leading-5 \[overflow-wrap:anywhere\]">\{ruleSummary\(rule\)\}<\/TableCell>/,
  "Account desktop rule summaries should wrap long formulas in the table");
assert.match(accountsSource, /<TableCell className="max-w-\[240px\] whitespace-pre-wrap break-words text-sm leading-5 text-destructive \[overflow-wrap:anywhere\]">\{row\.error \?\? row\.last_error \?\? row\.error_message \?\? "-"\}<\/TableCell>/,
  "Account desktop error diagnostics should preserve readable wrapping in the table");
assert.match(accountsSource, /className="max-w-\[220px\] whitespace-normal break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]"/,
  "Account desktop balance plan details should wrap inside the balance cell");
assert.match(accountsSource, /className="mt-0\.5 max-w-full whitespace-normal break-words text-xs leading-5 text-muted-foreground \[overflow-wrap:anywhere\]"/,
  "Account mobile balance plan names should wrap in the card");
assert.match(accountsSource, /<span className="whitespace-normal break-words \[overflow-wrap:anywhere\]">\{ruleSummary\(rule\)\}<\/span>/,
  "Account mobile rule summaries should wrap long formulas");
assert.match(accountsSource, /<div className="whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]">\{errorText\}<\/div>/,
  "Account mobile error diagnostics should preserve readable wrapping");

for (const [name, source] of [
  ["BL sync", blSyncSource],
  ["upstream monitor", upstreamMonitorSource],
] as const) {
  assert.match(source, /DialogBody/, `${name} long-form dialogs should use the shared dialog body`);
  assert.match(source, /max-h-\[min\(92dvh,720px\)\]/, `${name} long-form dialogs should fit small viewports`);
}

assert.match(blSyncSource, /<DialogHeader className="shrink-0 border-b border-border\/60 px-4 py-4 sm:px-6">/,
  "BL sync source editor dialog should keep its header fixed and visually separated");
assert.match(blSyncSource, /<DialogBody className="flex-1 space-y-4 py-5">/,
  "BL sync source editor form content should use the shared scrollable body spacing");
assert.match(blSyncSource, /<DialogFooter className="shrink-0 border-t border-border\/70 px-4 py-4 sm:px-6">/,
  "BL sync source editor dialog should keep actions fixed below the scrollable body");
assert.doesNotMatch(blSyncSource, /grid gap-4 md:grid-cols-2/,
  "BL sync source editor fields should not split into two columns at the narrow tablet breakpoint");
assert.match(blSyncSource, /grid gap-4 lg:grid-cols-2/,
  "BL sync source editor fields should wait until the large breakpoint for two-column layout");
assert.doesNotMatch(blSyncSource, /CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"/,
  "BL sync list headers should not compress title and counters into one row at the narrow tablet breakpoint");
assert.match(blSyncSource, /CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"/,
  "BL sync list headers should wait until the large breakpoint before using a horizontal layout");
assert.doesNotMatch(blSyncSource, /\bmd:col-span-2\b/,
  "BL sync source editor full-width fields should not create implicit spans at the narrow tablet breakpoint");
assert.match(blSyncSource, /lg:col-span-2 space-y-2/,
  "BL sync source editor full-width text fields should span columns only from the large breakpoint");
assert.match(blSyncSource, /flex flex-col gap-3 rounded-md border border-border\/70 p-3 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between/,
  "BL sync source editor switch rows should stay stacked until the large breakpoint");
assert.match(blSyncSource, /<Label htmlFor="bl-source-name">名称<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-name"/,
  "BL sync source editor name input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-base-url">源站地址<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-base-url"/,
  "BL sync source editor base URL input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-site-type">源站类型<\/Label>[\s\S]*<SelectTrigger id="bl-source-site-type">/,
  "BL sync source editor site type select should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-auth-mode">认证方式<\/Label>[\s\S]*<SelectTrigger id="bl-source-auth-mode">/,
  "BL sync source editor auth mode select should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-email">\{form\.siteType === "new_api" \? "用户名" : "邮箱"\}<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-email"/,
  "BL sync source editor username/email input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-new-api-user-id">New-Api-User<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-new-api-user-id"/,
  "BL sync source editor New API user input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-password">密码\{editingSite \? "（留空不修改）" : ""\}<\/Label>[\s\S]*<PasswordInput[\s\S]*id="bl-source-password"/,
  "BL sync source editor password input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-interval-min">采集间隔（分钟）<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-interval-min"/,
  "BL sync source editor interval input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-recharge-ratio">充值倍率<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-recharge-ratio"/,
  "BL sync source editor recharge ratio input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-proxy-url">代理（可选）<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-proxy-url"/,
  "BL sync source editor proxy input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-enabled">启用采集<\/Label>[\s\S]*<Switch[\s\S]*id="bl-source-enabled"/,
  "BL sync source editor enabled switch should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-access-token">\{form\.siteType === "new_api" \? "Session \/ Cookie \/ Access Token" : "Access Token"\}<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-access-token"/,
  "BL sync source editor access token input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-refresh-token">Refresh Token<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-refresh-token"/,
  "BL sync source editor refresh token input should be associated with its visible label");
assert.match(blSyncSource, /<Label htmlFor="bl-source-token-expire">过期时间<\/Label>[\s\S]*<Input[\s\S]*id="bl-source-token-expire"/,
  "BL sync source editor token expiry input should be associated with its visible label");
assert.doesNotMatch(blSyncSource, /<button type="button" className="max-w-\[260px\] text-left" onClick=\{\(\) => setSelectedSiteId\(String\(site\.id\)\)\}>/,
  "BL sync table source selector should not use a hand-written text button with a small hit area");
assert.match(blSyncSource, /<Button[\s\S]*variant="ghost"[\s\S]*className="h-auto min-h-11 max-w-\[260px\] justify-start px-2 py-1 text-left lg:min-h-10"[\s\S]*aria-label=\{`选择采集源 \$\{site\.name\}`\}[\s\S]*onClick=\{\(\) => setSelectedSiteId\(String\(site\.id\)\)\}/,
  "BL sync table source selector should use the shared Button with a clear label and touch-friendly target");

assert.match(upstreamMonitorSource, /<DialogHeader className="shrink-0 border-b border-border\/60 px-4 py-4 sm:px-6">/,
  "Upstream monitor editor dialog should keep its header fixed and visually separated");
assert.match(upstreamMonitorSource, /<DialogBody className="flex-1 space-y-4 py-5">/,
  "Upstream monitor editor form content should use the shared scrollable body spacing");
assert.match(upstreamMonitorSource, /<DialogFooter className="shrink-0 border-t border-border\/70 px-4 py-4 sm:px-6">/,
  "Upstream monitor editor dialog should keep actions fixed below the scrollable body");
assert.doesNotMatch(upstreamMonitorSource, /grid gap-3 md:grid-cols-3/,
  "Upstream monitor numeric controls should not become three cramped columns at the narrow tablet breakpoint");
assert.match(upstreamMonitorSource, /grid gap-3 lg:grid-cols-3/,
  "Upstream monitor numeric controls should wait until the large breakpoint for three-column layout");
assert.match(upstreamMonitorSource, /<Label htmlFor="monitor-check-interval-minutes">检测间隔分钟<\/Label>[\s\S]*<Input[\s\S]*id="monitor-check-interval-minutes"/,
  "Upstream monitor interval input should be associated with its visible label");
assert.match(upstreamMonitorSource, /<Label htmlFor="monitor-failure-threshold">连续错误次数<\/Label>[\s\S]*<Input[\s\S]*id="monitor-failure-threshold"/,
  "Upstream monitor failure threshold input should be associated with its visible label");
assert.match(upstreamMonitorSource, /<Label htmlFor="monitor-pause-minutes">暂停调度分钟<\/Label>[\s\S]*<Input[\s\S]*id="monitor-pause-minutes"/,
  "Upstream monitor pause input should be associated with its visible label");
assert.match(upstreamMonitorSource, /<Label htmlFor="monitor-model-id">测试模型<\/Label>[\s\S]*<Input[\s\S]*id="monitor-model-id"/,
  "Upstream monitor model input should be associated with its visible label");
assert.match(upstreamMonitorSource, /<SelectTrigger aria-label="选择测试模型">/,
  "Upstream monitor model select should expose a clear accessible label");
assert.match(upstreamMonitorSource, /<Label htmlFor="monitor-prompt">测试 Prompt<\/Label>[\s\S]*<Textarea[\s\S]*id="monitor-prompt"/,
  "Upstream monitor prompt textarea should be associated with its visible label");

assert.doesNotMatch(announcementsSource, /h-\[90vh\]|max-h-\[90vh\]/, "Announcement dialogs should avoid fixed 90vh heights on mobile");
assert.match(announcementsSource, /max-h-\[min\(92dvh,720px\)\] max-w-3xl/, "Announcement rule dialog should use a dynamic viewport height cap");
assert.match(announcementsSource, /max-h-\[min\(92dvh,720px\)\] max-w-2xl/, "Announcement editor dialog should use a dynamic viewport height cap");
assert.match(announcementsSource, /max-h-\[min\(92dvh,640px\)\] max-w-lg/, "Announcement bulk time dialog should use a compact dynamic viewport height cap");
assert.match(announcementsSource, /<DialogBody className="flex-1 space-y-4 py-5">/, "Announcement rule dialog content should live in a scrollable dialog body");
assert.match(announcementsSource, /<DialogTitle>\{editData\.id \? "编辑公告" : "新建公告"\}<\/DialogTitle>[\s\S]*<DialogBody className="flex-1 space-y-4 py-5">/,
  "Announcement editor form content should live in a scrollable dialog body");
const announcementBulkBodies = announcementsSource.match(/<DialogBody className="flex-1 space-y-4 py-4">/g) ?? [];
assert.equal(announcementBulkBodies.length, 3, "Announcement bulk dialogs should keep compact form content in scrollable dialog bodies");

assert.doesNotMatch(groupPanelSource, /h-\[88vh\]|max-h-\[88vh\]/, "Group editor dialog should avoid fixed 88vh heights on mobile");
assert.match(groupPanelSource, /max-h-\[min\(92dvh,760px\)\] w-\[calc\(100vw-1rem\)\] max-w-5xl/, "Group editor dialog should use a dynamic viewport height cap");

assert.doesNotMatch(botActivitySource, /h-\[90vh\]|max-h-\[90vh\]/, "Bot activity dialog should avoid fixed 90vh heights on mobile");
assert.match(botActivitySource, /max-h-\[min\(92dvh,720px\)\] max-w-3xl/, "Bot activity dialog should use a dynamic viewport height cap");
assert.match(botActivitySource, /<DialogBody className="flex-1 space-y-3 py-5">/, "Bot activity dialog content should live in a scrollable dialog body");
assert.doesNotMatch(botActivityPartsSource, /grid gap-2 sm:grid-cols-2 lg:grid-cols-4/,
  "Bot activity metric cards should not switch to denser columns at phone and cramped desktop breakpoints");
assert.match(botActivityPartsSource, /grid gap-2 md:grid-cols-2 xl:grid-cols-4/,
  "Bot activity metric cards should use two columns on narrow tablets and reserve four columns for wide screens");
assert.doesNotMatch(botActivityPartsSource, /grid gap-2 rounded-md border border-border\/70 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-4/,
  "Bot activity viewer stats should not compress four summary values into one row at the small breakpoint");
assert.match(botActivityPartsSource, /grid gap-2 rounded-md border border-border\/70 px-3 py-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4/,
  "Bot activity viewer stats should use two columns on narrow tablets and reserve four columns for wide screens");
assert.match(botActivityPartsSource, /InlineError/, "Bot activity query errors should use the shared inline error state");
assert.doesNotMatch(botActivityPartsSource, /<div className="rounded-md border border-destructive\/20 bg-destructive\/10 px-3 py-2 text-xs text-destructive">\s*\{state\.inviteActivityQuery\.error\.message\}\s*<\/div>/,
  "Bot activity query errors should not render as a hand-written destructive block");
assert.match(botActivityPartsSource, /<Label htmlFor="invite-activity-enabled" className="text-sm">启用邀请活动<\/Label>[\s\S]*<Switch[\s\S]*id="invite-activity-enabled"/,
  "Bot activity enabled switch should be associated with its visible label");
assert.doesNotMatch(botActivityPartsSource, /md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,2fr\)\]/,
  "Bot activity controls should not split date and reward fields at the narrow tablet breakpoint");
assert.match(botActivityPartsSource, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,2fr\)\]/,
  "Bot activity controls should wait until the large breakpoint before pairing date and reward controls");
assert.doesNotMatch(botActivityPartsSource, /sm:grid-cols-\[1fr_1fr_auto\]/,
  "Bot activity reward controls should stay stacked through phone and narrow tablet layouts");
assert.match(botActivityPartsSource, /lg:grid-cols-\[1fr_1fr_auto\]/,
  "Bot activity reward controls should only place the save button beside inputs on large screens");
assert.match(botActivityPartsSource, /className="w-full lg:w-auto lg:self-end"/,
  "Bot activity reward save action should remain a full-width touch target until large screens");
assert.doesNotMatch(botActivityPartsSource, /<span className="min-w-0 truncate">\{index \+ 1\}\. \{entry\.inviterUsername \|\| entry\.inviterEmail\}<\/span>/,
  "Bot activity leaderboard identities should wrap instead of truncating inviter usernames or emails");
assert.match(botActivityPartsSource, /<span className="min-w-0 whitespace-normal break-all leading-5 \[overflow-wrap:anywhere\]">\{index \+ 1\}\. \{entry\.inviterUsername \|\| entry\.inviterEmail\}<\/span>/,
  "Bot activity leaderboard identities should preserve long inviter usernames or emails");
assert.doesNotMatch(botManagementPartsSource, /\bmd:(?:grid-cols|self-end)/,
  "Bot management controls should not switch to dense multi-column form layouts at the narrow tablet breakpoint");
assert.match(botManagementPartsSource, /lg:grid-cols-2/,
  "Bot management feature controls should wait until the large breakpoint for two-column layout");
assert.match(botManagementPartsSource, /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/,
  "Bot management message composer should keep the send action below the textarea until the large breakpoint");
assert.match(botManagementLogsSource, /min-w-0 break-all/, "Bot management status values should wrap long identifiers on narrow tablets");
assert.doesNotMatch(botManagementLogsSource, /className="min-w-0 truncate"/, "Bot management status values should not force single-line truncation");
