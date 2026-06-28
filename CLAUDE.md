# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

S2A Manager 是面向 Sub2API 站点的运维管理面板（Next.js 14 全栈 + 独立 worker 进程）。集中管理多个 Sub2API 后台连接，处理分组倍率、账号调度、倍率采集、上游可用性检测、公告和任务日志。详见 [README.md](./README.md)。

## 常用命令

```bash
npm run dev              # 开发 Web 服务，默认 http://127.0.0.1:3000（端口由进程级 PORT 控制，未设则 3000）
npm run build            # prisma generate + next build
npm run start            # 生产 Web 服务
npm run worker           # 后台 worker（tsx src/worker/monitor.ts），独立进程
npm run lint             # ESLint（注意：用了 --no-eslintrc，只读 .eslintrc.json）
npm run prisma:generate  # 生成 Prisma Client
npm run prisma:push      # prisma db push（开发期同步 schema，不走迁移）
npx prisma migrate deploy  # 生产：应用 prisma/migrations 下已提交的迁移
npx prisma validate
S2A_WORKER_ONCE=1 npm run worker  # 只跑一轮 worker 后退出，排查问题用
```

- 没有测试套件，没有测试框架。验证改动靠 `npm run lint`、`npm run build` 和手动运行。
- Web 与 worker 是**两个独立进程**。只启动 Web 可用管理页面，但所有自动任务（采集、自动同步、上游检测、余额预警、日志清理、心跳）都依赖 worker。

## 架构要点

### 三层结构
- **前端**：`src/app`（App Router）+ `src/components/app`（业务面板，每个面板对应一个功能域）+ `src/components/ui`（Radix 封装）。客户端通过 tRPC React Query hooks 调用后端，类型从 `AppRouter` 推断。
- **API 层**：tRPC。路由聚合在 `src/server/api/routers/_app.ts`，每个功能域一个 router 文件。`src/server/api/trpc.ts` 定义 `publicProcedure` 和 `protectedProcedure`（后者要求登录会话）。HTTP 入口在 `src/app/api/trpc/[trpc]`。
- **业务逻辑层**：`src/server/*.ts`，与 tRPC 解耦的纯函数模块（如 `bl-rate-sync.ts`、`announcement-rules.ts`、`upstream-monitor.ts`、`account-balance-alert.ts`）。**router 和 worker 共用这一层**——这是关键设计：同一套规则既能被页面手动触发，也能被 worker 自动触发。

### worker 主循环（`src/worker/monitor.ts`）
单次 `runCycle()` 顺序执行：倍率采集 → 采集后应用绑定规则 → 清理旧日志 → 自动同步连接的分组倍率（含公告发布）→ 余额预警 → 上游检测。循环间隔由数据库 `Setting` 表控制（优先于环境变量），通过 `worker_*` 系列 Setting 键写回心跳和运行状态供“服务状态”页读取。worker 用自己 new 的 `PrismaClient`，不复用 `src/server/db.ts`。单轮超时不会并发重叠（下一轮等当前轮结束）。

### 配置与状态：Setting 表
`Setting`（key-value）既存运行时配置（worker 间隔、检测超时/并发等），也存 worker 运行状态（心跳、上次运行结果、下次运行时间）。`src/server/worker-settings.ts` 负责把行解析成 runtime settings。**数据库设置优先于环境变量。**

### 双数据源（核心概念区分）
- **采集源（BL collection sites）**：`src/server/bl-collection/` —— 主动定时抓取**外部源站**的倍率/价格。源站有两种类型，由 `clients.ts` 的 `clientForBlCollectionSite` 按 `siteType` 分发到 `BlSub2ApiClient` 或 `BlNewApiClient`。采集结果存 `BlCollected*` 表。
- **目标 Sub2API 连接**：`src/server/clients/sub2api-admin.ts`（`Sub2ApiAdminClient`）—— 被管理的目标站后台 API，用于读写分组/账号。
- 倍率规则把「采集源数据」映射到「目标连接的分组/账号倍率」，绑定关系存在 `BlSourceBinding` / `BlGroupRateRule` / `BlAccountRateRule`。

### 认证（`src/server/auth.ts`）
单管理员模型。首次访问 `/setup` 创建管理员（bcrypt 哈希）；登录签发 JWT（jose，HS256，7 天）存 `s2a_session` httpOnly cookie。tRPC context 解析会话，`protectedProcedure` 据此鉴权。

### 加密（`src/server/crypto.ts`）
连接的 admin API key、源站凭证用 AES-256-GCM 加密后入库，密钥来自 `ENCRYPTION_KEY`（base64 32 字节）。格式为 `iv(12) + tag(16) + ciphertext` 的 base64。**已有加密数据后不要更换 `ENCRYPTION_KEY`，否则无法解密。**

### HTTP 传输降级（`src/server/http.ts`）
出站 HTTP 请求默认用 `fetch`，失败时按 origin 降级到 PowerShell 传输（`execFileSync`）。这是为绕开某些 Windows/网络环境下 fetch 失败设计的，改动出站请求逻辑时注意保留这个 fallback。

### 数据库
PostgreSQL + Prisma 5。schema 在 `prisma/schema.prisma`，所有表/列用 `@map` 映射 snake_case，时间列用 `@db.Timestamptz(3)`。迁移在 `prisma/migrations/`（已有 0001–0010）。**改 schema 后要新增迁移文件**，生产用 `migrate deploy`；开发期可用 `prisma:push` 快速同步。旧版 SQLite 数据不会自动迁移到 PostgreSQL。

## 环境变量
最小配置见 `.env.example`。生产必须替换 `DATABASE_URL`、`APP_SECRET`（≥24 位）、`ENCRYPTION_KEY`（`openssl rand -base64 32`）。可选 `S2A_*` 变量见 README「环境变量」章节，但数据库 Setting 优先。

## 约定
- 路径别名 `@/*` → `src/*`（见 `tsconfig.json`）。
- 新增功能域：建 `src/server/api/routers/<域>.ts`，在 `_app.ts` 注册；可复用/抽到 `src/server/<域>.ts` 的纯逻辑层供 worker 共用；前端在 `src/components/app/` 加面板。
- 任务日志通过 `src/server/sync-logs.ts` 写本地文件（目录由 `S2A_LOG_DIR` 控制，默认 `logs/`），不入数据库；动作名常量见 `src/shared/log-actions.ts` 和 `src/lib/log-actions.ts`。
