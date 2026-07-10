# S2A Rate Bot

`s2a-rate-bot` 是独立的 Next.js 管理端，用于采集 Sub2API / New API 倍率、计算目标分组规则、运行定时 Worker，并管理目标站账号是否参与调度。

## 功能

- 首次启动初始化管理员，后续使用邮箱和密码登录。
- 在 SQLite 中保存全局配置、采集站、倍率快照、版本化分组规则和 Worker 运行记录。
- 使用 AES-256-GCM 加密目标站 Admin Key、采集站密码和 Token。
- 直接从目标站读取分组与账号，SQLite 不作为目标站状态的权威来源。
- 支持 Sub2API 与 New API 采集站，统一应用代理、请求超时和错误格式。
- 通用 Worker 按站点间隔并发采集，并在采集后应用已启用的倍率规则。

## 运行要求

- Node.js 22.13 或更高版本。
- 本地可写目录，用于 SQLite 数据库。
- 可访问目标站和采集站的网络环境。

## 环境变量

复制 `.env.example` 为 `.env.local`，供 Next.js Web 进程读取；至少设置 `APP_SECRET`：

```bash
APP_SECRET=replace-with-a-random-secret
DATABASE_URL=file:./data/s2a-rate-bot.db
```

`APP_SECRET` 同时用于会话签名和敏感配置加密。生产环境可使用 `openssl rand -hex 32` 生成随机值；更换该值后，已有密文配置无法解密，需要重新录入。

`DATABASE_URL` 仅支持本地 `file:` SQLite URL；默认值为 `file:./data/s2a-rate-bot.db`。

## 本地开发

```bash
npm ci
npm run dev
```

管理端默认地址为 `http://127.0.0.1:18074`。首次访问时，登录对话框会切换到管理员初始化流程。

初始化后依次完成：

1. 在“全局配置”中保存目标站、代理和 Worker 参数。
2. 在“倍率采集”中添加采集站并执行远端刷新。
3. 在“分组倍率”中绑定采集源分组、预览并启用规则。
4. 在“账号调度”中刷新远端账号并启停调度。

## Worker

Worker 是独立常驻进程，与 Next.js Web 进程共享同一个 SQLite 数据库和环境变量。`tsx` 不会自动读取 Next.js 的 `.env.local`，启动 Worker 的 Shell 或进程管理器必须显式注入 `APP_SECRET` 和 `DATABASE_URL`：

```bash
npm run worker
```

每轮运行会重新读取全局 Worker 间隔和并发数。收到 `SIGINT` 或 `SIGTERM` 后，进程会结束当前周期或等待并安全退出。

临时执行单轮诊断：

```bash
S2A_WORKER_ONCE=1 npm run worker
```

PowerShell：

```powershell
$env:S2A_WORKER_ONCE='1'; npm run worker
```

## 生产部署

```bash
npm ci
npm run build
npm run start
```

另启一个受进程管理器托管的 Worker 进程：

```bash
npm run worker
```

Web 与 Worker 必须使用相同的 `APP_SECRET` 和 `DATABASE_URL`。部署时应持久化 `data/` 目录，并在备份 SQLite 前停止写入进程或使用 SQLite 在线备份机制。

## 验证命令

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 主要路由

- `/sources`：采集站 CRUD、远端刷新和聚合倍率。
- `/groups`：远端目标分组、倍率规则、绑定、预览和应用。
- `/accounts`：远端账号状态和调度开关。
- `/settings`：目标站、代理和 Worker 配置。
- `/api/worker/status`：最近一轮 Worker 运行摘要。

所有管理 API 都要求有效登录会话。远端错误会作为明确错误返回，不会写入假成功状态。
