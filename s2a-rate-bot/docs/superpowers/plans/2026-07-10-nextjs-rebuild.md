# S2A Rate Bot Next.js 重构实现计划

> **执行方式：** 使用 `executing-plans` 分批实现；每个功能遵循 TDD 红-绿-重构；步骤使用复选框跟踪。

**目标：** 将现有独立 Node.js + 静态 UI 的 `s2a-rate-bot` 重构为 Next.js + shadcn/ui + SQLite 管理端，保留真实远端接口能力并补齐登录、全局配置和通用 Worker。

**架构：** Next.js App Router 提供页面和 Route Handlers；`src/server` 按认证、配置、存储、远端客户端、采集和 Worker 分层。SQLite 是本地持久化来源，目标分组与目标账号页面始终以远端 API 返回为权威数据。

**技术栈：** Next.js 14、React 18、TypeScript、Tailwind CSS、shadcn/ui、Zod、Node SQLite、Node test runner。

---

## 关键边界

- 新版是 `s2a-rate-bot/` 下的独立应用，不修改根项目业务模块。
- 一级页面固定为 `/groups`、`/sources`、`/accounts`、`/settings`。
- 管理员凭据存储在 SQLite；`APP_SECRET` 仅用于会话签名和敏感配置加密。
- 所有外部 HTTP 请求经过共享客户端，统一应用代理、超时和错误格式。
- 倍率规则使用版本化 `ruleType + parameters` 契约；新算法未确认前不扩展旧语义。
- QQBot、公告、上游检测、邀请活动不进入新版范围。

## 任务 1：Next.js 工程骨架和顶部导航

**文件：**
- 修改：`package.json`
- 修改：`tsconfig.json`
- 创建：`next.config.mjs`
- 创建：`postcss.config.mjs`
- 创建：`tailwind.config.ts`
- 创建：`src/app/layout.tsx`
- 创建：`src/app/page.tsx`
- 创建：`src/app/groups/page.tsx`
- 创建：`src/app/sources/page.tsx`
- 创建：`src/app/accounts/page.tsx`
- 创建：`src/app/settings/page.tsx`
- 创建：`src/components/app-shell.tsx`
- 创建：`src/app/globals.css`
- 修改：`tests/ui-structure.test.ts`

- [ ] 将静态 UI 结构测试改为 Next.js 路由和导航结构测试，并运行确认失败。
- [ ] 添加 Next.js、React、Tailwind 和 Radix/shadcn 依赖。
- [ ] 创建 App Router 根布局和四个页面骨架。
- [ ] 创建顶部导航，当前路由有明确选中态，移动端无横向溢出。
- [ ] 运行 `npm test -- tests/ui-structure.test.ts` 和 `npm run typecheck`。
- [ ] 提交任务 1。

## 任务 2：SQLite 与管理员认证

**文件：**
- 修改：`src/storage/sqlite-schema.ts`
- 创建：`src/server/auth/password.ts`
- 创建：`src/server/auth/session.ts`
- 创建：`src/server/auth/service.ts`
- 创建：`src/app/api/auth/status/route.ts`
- 创建：`src/app/api/auth/setup/route.ts`
- 创建：`src/app/api/auth/login/route.ts`
- 创建：`src/app/api/auth/logout/route.ts`
- 创建：`src/components/auth-dialog.tsx`
- 创建：`middleware.ts`
- 创建：`tests/auth.test.ts`

- [ ] 编写首次初始化、登录成功、错误密码和未授权访问测试并确认失败。
- [ ] SQLite 增加管理员、会话必要元数据和 schema 版本迁移。
- [ ] 实现密码哈希、签名 Session Cookie 和认证服务。
- [ ] 实现初始化/登录阻塞弹窗和退出登录。
- [ ] 运行认证测试、全量测试和类型检查。
- [ ] 提交任务 2。

## 任务 3：全局配置和共享 HTTP 客户端

**文件：**
- 修改：`src/storage/app-config.ts`
- 修改：`src/storage/sqlite-schema.ts`
- 创建：`src/server/config/service.ts`
- 创建：`src/server/crypto.ts`
- 修改：`src/adapters/http-client.ts`
- 创建：`src/app/api/settings/route.ts`
- 创建：`src/app/api/settings/test-target/route.ts`
- 修改：`src/app/settings/page.tsx`
- 创建：`tests/settings.test.ts`

- [ ] 编写敏感字段加密、配置校验、代理/超时注入测试并确认失败。
- [ ] 保存目标站、全局代理、Worker 间隔、超时和并发配置。
- [ ] 实现统一 HTTP 请求选项和目标站连接测试。
- [ ] 实现全局配置表单和 Worker 最近状态区域。
- [ ] 运行配置测试、全量测试、类型检查和构建。
- [ ] 提交任务 3并进行第一批审查。

## 任务 4：采集站管理和真实刷新

- [ ] 为采集站 CRUD、Sub2API/New API 刷新和失败记录编写测试。
- [ ] 迁移现有采集客户端，统一认证、代理和超时参数。
- [ ] 实现采集站添加、编辑、启停、删除、单站刷新和全部刷新 API。
- [ ] 刷新成功保存余额、分组倍率、最后成功时间；失败保存明确错误。
- [ ] 提交任务 4。

## 任务 5：倍率采集页面

- [ ] 编写采集站列表、聚合分组和状态展示结构测试。
- [ ] 实现采集站 Dialog、站点表格、分组聚合表格和过滤器。
- [ ] 明确区分“重新请求远端刷新”和“重新读取本地页面数据”。
- [ ] 实现加载、空数据、错误和执行中状态。
- [ ] 提交任务 5。

## 任务 6：目标分组和版本化规则契约

- [ ] 编写目标分组直接远端刷新、规则启停和多源绑定测试。
- [ ] 实现目标分组 API，禁止用 SQLite 快照替代远端刷新。
- [ ] 保存目标分组规则及独立绑定记录。
- [ ] 实现 `ruleVersion`、`ruleType`、`parameters` 契约和计算预览边界。
- [ ] 保留经测试的旧规则作为显式版本，不增加未确认的新算法。
- [ ] 提交任务 6并进行第二批审查。

## 任务 7：通用 Worker

- [ ] 编写 Sub2API/New API 到期采集、并发、超时、重入和运行摘要测试。
- [ ] 将现有 Sub2 专用周期重构为站点类型无关的 Worker 编排。
- [ ] 采集完成后执行已启用规则，仅在倍率变化时更新目标站。
- [ ] 保存每轮运行统计和完整失败原因。
- [ ] 提交任务 7。

## 任务 8：账号调度

- [ ] 编写远端账号刷新和 schedulable 启停失败/成功测试。
- [ ] 实现账号 Route Handlers 和响应类型。
- [ ] 实现账号状态、平台、分组和调度开关页面。
- [ ] 远端操作失败时保持原状态并展示错误。
- [ ] 提交任务 8。

## 任务 9：清理与全量验证

- [ ] 删除旧 `ui/`、QQBot 和不再使用的自建 API Server。
- [ ] 删除旧依赖、死代码和失效测试。
- [ ] 更新 README、环境变量示例和部署说明。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 检查所有计划条目和 Git diff。
- [ ] 提交任务 9并使用 `finishing-a-development-branch` 收尾。
