# 采集间隔输入校验修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复采集站表单把整数采集间隔 `600` 判定为无效的问题。

**架构：** 保持后端正整数校验不变，仅让前端数字输入组件接受调用方提供字段级最小值。采集间隔使用整数约束，充值倍率继续使用正小数约束。

**技术栈：** Next.js 14、React 18、TypeScript、Node.js Test Runner

---

## 文件结构

- 修改：`tests/sources-ui.test.ts`，增加采集间隔与充值倍率 HTML 约束的回归测试。
- 修改：`src/components/sources/source-site-dialog.tsx`，让 `NumberInput` 接收明确的 `min`，并为两个字段传入各自约束。

### 任务 1：修复采集站数字输入约束

**文件：**
- 修改：`tests/sources-ui.test.ts`
- 修改：`src/components/sources/source-site-dialog.tsx`

- [ ] **步骤 1：编写失败的回归测试**

在 `tests/sources-ui.test.ts` 中增加：

```typescript
test("source site interval accepts positive integer seconds", () => {
  const dialog = source("src/components/sources/source-site-dialog.tsx");

  assert.match(dialog, /label="采集间隔（秒）"[\s\S]*min="1"[\s\S]*step="1"/);
  assert.match(dialog, /label="充值倍率"[\s\S]*min="0\.0001"[\s\S]*step="any"/);
});
```

- [ ] **步骤 2：运行定向测试并确认失败**

运行：

```powershell
node --import tsx --test --test-name-pattern "source site interval accepts" tests/sources-ui.test.ts
```

预期：FAIL，采集间隔调用处尚未包含 `min="1"` 和 `step="1"`。

- [ ] **步骤 3：编写最少实现代码**

将两个调用改为显式约束：

```tsx
<NumberInput min="0.0001" step="any" value={form.rechargeRatio} onChange={(value) => update("rechargeRatio", value)} />
<NumberInput min="1" step="1" value={form.intervalSeconds} onChange={(value) => update("intervalSeconds", value)} />
```

并将组件签名改为：

```tsx
function NumberInput({ value, onChange, min, step }: Readonly<{
  value: string;
  onChange: (value: string) => void;
  min: string;
  step: string;
}>) {
  return <input required type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass()} />;
}
```

- [ ] **步骤 4：运行定向测试并确认通过**

运行：

```powershell
node --import tsx --test --test-name-pattern "source site interval accepts" tests/sources-ui.test.ts
```

预期：PASS。

- [ ] **步骤 5：运行完整验证**

运行：

```powershell
npm test
npm run typecheck
```

预期：全部测试通过，TypeScript 无错误。

- [ ] **步骤 6：Commit**

```powershell
git add s2a-rate-bot/tests/sources-ui.test.ts s2a-rate-bot/src/components/sources/source-site-dialog.tsx
git commit -m "fix: 修复采集间隔整数校验"
```
