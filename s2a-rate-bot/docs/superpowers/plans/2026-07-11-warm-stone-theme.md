# 暖石色双主题实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 `s2a-rate-bot` 全部界面实现暖石色浅色主题、深棕黑暗色主题及持久化切换。

**架构：** 使用 `globals.css` 中的语义 CSS 变量作为唯一配色来源，并通过 Tailwind 语义颜色名称消费变量。根布局在水合前恢复主题，独立 `ThemeToggle` 负责交互；全部组件从 `slate-*` 迁移到语义类名。

**技术栈：** Next.js 14 App Router、React 18、TypeScript、Tailwind CSS、Node.js Test Runner、Lucide React

---

## 文件结构

- 创建：`src/components/theme-toggle.tsx`，提供可访问的明暗主题切换和持久化。
- 修改：`src/app/globals.css`，定义浅色/暗色语义 token、页面渐变和降级动画规则。
- 修改：`tailwind.config.ts`，映射语义颜色、阴影和 class 暗色模式。
- 修改：`src/app/layout.tsx`，在 React 水合前恢复主题。
- 修改：`src/components/app-shell.tsx`，挂载主题切换并迁移导航配色。
- 修改：`src/components/**/*.tsx`，迁移所有界面的表面、边框、文字、按钮和状态色。
- 修改：`tests/ui-structure.test.ts`，覆盖主题基础设施与全局迁移约束。
- 修改：`tests/sources-ui.test.ts`，覆盖采集页面弹窗和表格的语义配色。

### 任务 1：建立主题 token 与水合前初始化

**文件：**
- 修改：`tests/ui-structure.test.ts`
- 修改：`tailwind.config.ts`
- 修改：`src/app/globals.css`
- 修改：`src/app/layout.tsx`

- [ ] **步骤 1：编写失败测试**

在 `tests/ui-structure.test.ts` 增加：

```typescript
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
```

- [ ] **步骤 2：验证测试因主题 token 缺失而失败**

运行：

```powershell
node --import tsx --test --test-name-pattern "warm stone themes" tests/ui-structure.test.ts
```

预期：FAIL，`globals.css` 尚未定义暖石色变量。

- [ ] **步骤 3：实现语义 token 和 Tailwind 映射**

`tailwind.config.ts` 的 `extend` 使用：

```typescript
extend: {
  colors: {
    background: "rgb(var(--background) / <alpha-value>)",
    surface: "rgb(var(--surface) / <alpha-value>)",
    "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
    foreground: "rgb(var(--foreground) / <alpha-value>)",
    muted: "rgb(var(--foreground-muted) / <alpha-value>)",
    border: "rgb(var(--border) / <alpha-value>)",
    "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
    primary: "rgb(var(--primary) / <alpha-value>)",
    "primary-foreground": "rgb(var(--primary-foreground) / <alpha-value>)",
  },
  boxShadow: { panel: "0 16px 44px rgb(var(--shadow) / 0.16)" },
},
```

`globals.css` 使用空格分隔 RGB token，浅色和暗色分别定义：

```css
:root {
  color-scheme: light;
  --background: 240 235 227;
  --background-accent: 245 239 231;
  --surface: 255 255 255;
  --surface-muted: 250 250 249;
  --foreground: 28 25 23;
  --foreground-muted: 120 113 108;
  --border: 231 229 228;
  --border-strong: 214 211 209;
  --primary: 249 156 0;
  --primary-foreground: 28 25 23;
  --shadow: 28 25 23;
}

.dark {
  color-scheme: dark;
  --background: 12 10 9;
  --background-accent: 55 48 43;
  --surface: 28 25 23;
  --surface-muted: 41 37 36;
  --foreground: 250 250 249;
  --foreground-muted: 168 162 158;
  --border: 68 64 60;
  --border-strong: 87 83 78;
  --primary: 249 156 0;
  --primary-foreground: 28 25 23;
  --shadow: 0 0 0;
}
```

根布局内联脚本在水合前读取 `s2a-rate-theme`，否则读取系统偏好，并切换 `document.documentElement.classList`。

- [ ] **步骤 4：验证主题基础测试通过**

运行同一步骤 2 的命令，预期 PASS。

- [ ] **步骤 5：提交任务 1**

```powershell
git add s2a-rate-bot/tests/ui-structure.test.ts s2a-rate-bot/tailwind.config.ts s2a-rate-bot/src/app/globals.css s2a-rate-bot/src/app/layout.tsx
git commit -m "feat: 建立暖石色双主题基础（任务 1/4）"
```

### 任务 2：实现主题切换和应用壳层

**文件：**
- 创建：`src/components/theme-toggle.tsx`
- 修改：`src/components/app-shell.tsx`
- 修改：`tests/ui-structure.test.ts`

- [ ] **步骤 1：编写失败测试**

```typescript
test("application shell exposes an accessible persisted theme toggle", () => {
  const shell = source("src/components/app-shell.tsx");
  const toggle = source("src/components/theme-toggle.tsx");

  assert.match(shell, /ThemeToggle/);
  assert.match(toggle, /aria-label="切换明暗主题"/);
  assert.match(toggle, /localStorage\.setItem\("s2a-rate-theme"/);
  assert.match(toggle, /document\.documentElement\.classList\.toggle\("dark"/);
  assert.match(toggle, /Sun/);
  assert.match(toggle, /Moon/);
});
```

- [ ] **步骤 2：运行测试并确认 `ThemeToggle` 缺失**

```powershell
node --import tsx --test --test-name-pattern "persisted theme toggle" tests/ui-structure.test.ts
```

预期：FAIL。

- [ ] **步骤 3：实现主题切换组件**

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "s2a-rate-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    setDark(next);
  };

  return <button type="button" aria-label="切换明暗主题" aria-pressed={dark} onClick={toggle} className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-foreground transition-colors hover:bg-surface">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>;
}
```

在 `AppShell` 顶部挂载 `ThemeToggle`，并将导航迁移到 `background`、`surface`、`border`、`foreground`、`muted`、`primary` 语义类。

- [ ] **步骤 4：运行测试并确认通过**

运行步骤 2 命令，预期 PASS。

- [ ] **步骤 5：提交任务 2**

```powershell
git add s2a-rate-bot/src/components/theme-toggle.tsx s2a-rate-bot/src/components/app-shell.tsx s2a-rate-bot/tests/ui-structure.test.ts
git commit -m "feat: 添加持久化主题切换（任务 2/4）"
```

### 任务 3：迁移全部业务组件到语义配色

**文件：**
- 修改：`src/components/auth-dialog.tsx`
- 修改：`src/components/settings-form.tsx`
- 修改：`src/components/worker-status-panel.tsx`
- 修改：`src/components/accounts/accounts-dashboard.tsx`
- 修改：`src/components/groups/group-rule-card.tsx`
- 修改：`src/components/groups/groups-dashboard.tsx`
- 修改：`src/components/sources/source-rates-table.tsx`
- 修改：`src/components/sources/source-site-dialog.tsx`
- 修改：`src/components/sources/source-site-table.tsx`
- 修改：`src/components/sources/sources-dashboard.tsx`
- 修改：`tests/ui-structure.test.ts`
- 修改：`tests/sources-ui.test.ts`

- [ ] **步骤 1：编写失败的全局迁移测试**

```typescript
test("components use semantic theme colors instead of slate utilities", () => {
  const components = [
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
  ].map(source).join("\n");

  assert.doesNotMatch(components, /(?:bg|text|border|ring)-slate-/);
  assert.match(components, /bg-surface/);
  assert.match(components, /text-muted/);
  assert.match(components, /border-border/);
});
```

在 `tests/sources-ui.test.ts` 增加弹窗遮罩、主按钮和表格表面的语义类断言。

- [ ] **步骤 2：运行 UI 测试并确认旧 Slate 类导致失败**

```powershell
node --import tsx --test tests/ui-structure.test.ts tests/sources-ui.test.ts
```

预期：FAIL，组件仍包含 `slate-*`。

- [ ] **步骤 3：按统一映射迁移组件**

使用以下精确映射，不改变组件结构：

| 旧用途 | 新语义类 |
| --- | --- |
| 页面/卡片白底 | `bg-surface` |
| 次级浅灰底 | `bg-surface-muted` |
| 标题/正文 | `text-foreground` |
| 次要文字 | `text-muted` |
| 默认边框 | `border-border` |
| 强边框/输入框 | `border-border-strong` |
| 黑色主按钮/选中导航 | `bg-primary text-primary-foreground` |
| 输入焦点 | `focus:ring-2 focus:ring-primary` |
| 卡片层级 | `shadow-panel` |

成功、警告、错误和信息徽章保留现有色相，但为暗色增加对应 `dark:bg-*-950 dark:text-*-300` 类。弹窗内容使用 `bg-surface text-foreground`，遮罩保持 `bg-stone-950/60`。

- [ ] **步骤 4：运行 UI 测试并确认通过**

运行步骤 2 命令，预期 PASS。

- [ ] **步骤 5：提交任务 3**

```powershell
git add s2a-rate-bot/src/components s2a-rate-bot/tests/ui-structure.test.ts s2a-rate-bot/tests/sources-ui.test.ts
git commit -m "feat: 迁移全部界面到暖石色主题（任务 3/4）"
```

### 任务 4：完整验证与视觉检查

**文件：**
- 修改：仅在验证发现真实问题时修改对应主题文件或组件。

- [ ] **步骤 1：运行自动化验证**

```powershell
npm test
npm run typecheck
npm run build
```

预期：测试全部通过，TypeScript 无错误，Next.js 生产构建成功。

- [ ] **步骤 2：运行旧色扫描**

```powershell
rg -n "(?:bg|text|border|ring)-slate-" src/components
```

预期：无匹配。

- [ ] **步骤 3：视觉验证**

启动 `npm run dev`，分别在浅色和暗色检查 `/groups`、`/sources`、`/accounts`、`/settings`：

- `375px`：无横向滚动，主题按钮点击区域不小于 `44px`。
- `768px`：导航、表单和卡片层级清晰。
- `1024px` 与 `1440px`：表格、弹窗和页面背景保持统一表面层级。
- 键盘 Tab：所有控件焦点环可见。
- 刷新页面：用户主题选择保持且无明显闪烁。

- [ ] **步骤 4：提交验证修正**

如果视觉验证产生修正，提交：

```powershell
git add s2a-rate-bot/src s2a-rate-bot/tests
git commit -m "fix: 完善双主题视觉一致性（任务 4/4）"
```

如果无需修正，不创建空提交。
