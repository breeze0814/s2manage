import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, ROOT), "utf8");
const DIALOG_FILES = [
  "src/components/groups/group-rule-dialog.tsx",
  "src/components/groups/group-binding-selector.tsx",
  "src/components/groups/group-rule-fields.tsx",
  "src/components/groups/group-rule-preview.tsx",
] as const;

test("target group routes and UI modules are present", () => {
  const paths = [
    "src/app/api/groups/route.ts",
    "src/app/api/groups/[id]/rule/route.ts",
    "src/app/api/groups/[id]/preview/route.ts",
    "src/app/api/groups/[id]/apply/route.ts",
    "src/app/api/groups/refresh/route.ts",
    "src/app/api/groups/[id]/refresh/route.ts",
    "src/components/groups/groups-dashboard.tsx",
    "src/components/groups/group-rule-table.tsx",
    ...DIALOG_FILES,
  ];
  for (const path of paths) assert.equal(existsSync(new URL(path, ROOT)), true, `${path} should exist`);
  const dashboard = source("src/components/groups/groups-dashboard.tsx");
  const dashboardHook = source("src/components/groups/use-groups-dashboard.ts");
  assert.match(dashboard, /刷新分组/);
  assert.match(dashboardHook, /group === null/);
  assert.match(dashboardHook, /已清理本地规则/);
  assert.doesNotMatch(dashboard, /规则版本 v1|按采集分组绑定|sourceSiteId \+ sourceGroupId/);
});

test("target group rule dialog exposes bindings, calculation and preview", () => {
  const dialog = DIALOG_FILES.map(source).join("\n");
  for (const pattern of [
    /绑定采集分组/, /samePlatform/, /没有相同平台的采集倍率/, /min-h-10/, /first:border-t-0/,
    /原 ×\{formatRate\(rate\.rawRate\)\}/, /有效 ×\{formatRate\(rate\.effectiveRate\)\}/,
    /预览倍率/, /选择采集分组/, /配置与预览/, /max-h-\[25rem\]/,
    /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(260px,0\.7fr\)\]/, /xl:grid-cols-4/,
    /<aside className="space-y-3">/, /calculatePreview/, /evaluateRateRule/, /不会保存或应用/,
    /计算最小值/, /自定义公式/, /百分比调整/, /adjustmentValue/, /<Select\s+ariaLabel="规则类型"/, /from "\.\.\/ui\/dialog"/,
    /className="compact-icon-button"/, /<Pencil className="size-3"/,
  ]) assert.match(dialog, pattern);
  assert.doesNotMatch(dialog, /<select|乘数|suffix="倍率"/);
});

test("target group table exposes rule state and actions", () => {
  const table = [
    "src/components/groups/group-rule-table.tsx",
    "src/components/groups/group-rule-table-layouts.tsx",
    "src/components/groups/group-rule-table-headers.tsx",
    "src/components/groups/group-rule-presentations.tsx",
  ].map(source).join("\n");
  for (const pattern of [
    /<Table/, /<TableHeader/, /<TableBody/, /下限/, /PlatformLabel/, /visible\.map/,
    /flex-col items-start/, /siteNames\.get\(binding\.sourceSiteId\)/,
    /\{siteName\}[\s\S]*rate\?\.groupName/, /刷新此分组/, /className="size-3"/,
    /compact-icon-button-primary/, /RateChangeCell/, /lastAppliedFromRate/, /倍率变化/,
  ]) assert.match(table, pattern);
  assert.match(table, /group\.bindings\.slice\(0, limit\)/);
  assert.doesNotMatch(table, /text="刷新"|text="预览"|text="应用"/);
});
