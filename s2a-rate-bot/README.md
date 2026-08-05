# S2A Rate Bot

`s2a-rate-bot` 是独立的 Next.js 管理端，用于采集 Sub2API / New API 倍率、计算目标分组规则、运行定时 Worker，并检测目标站账号通道可用性。

## 功能

- 首次启动初始化管理员，后续使用邮箱和密码登录。
- 在 SQLite 中保存全局配置、采集站、倍率快照、账号采集分组绑定、测试联动策略、账号测试状态、带格式版本的分组规则和 Worker 运行记录。
- 使用 AES-256-GCM 加密目标站 Admin Key、采集站密码和 Token。
- 直接从目标站读取分组与账号，SQLite 不作为目标站状态的权威来源。
- 支持 Sub2API 与 New API 采集站，统一应用代理、请求超时和错误格式。
- 通用 Worker 按站点间隔并发采集，并在采集后应用已启用的倍率规则。
- 提供可嵌入 Sub2API 的工单、抽奖、订单补偿和用量排行榜页面，并在管理端统一配置与运营。
- 工单支持四态流转、分类/优先级、图片附件和客服回复；单图上限 2 MB，整次附件请求上限 13 MB。
- 抽奖支持即时开奖中奖率、定时开奖奖品份数、报名撤回、自动兑换码和公开或私密中奖名单。
- 订单补偿支持加密配置联动小铺凭据、活动时间与补偿比例；计算完成后按合计金额自动生成余额兑换码，并保留明确的成功或失败记录。

## 运行要求

- Node.js 22.13 或更高版本。
- 本地可写目录，用于 SQLite 数据库。
- 可访问目标站和采集站的网络环境。

## 环境变量

复制 `.env.example` 为 `.env`，供 Next.js Web、Worker 和 PM2 共同读取；至少设置 `APP_SECRET`：

```bash
APP_SECRET=replace-with-a-random-secret
DATABASE_URL=file:./data/s2a-rate-bot.db
PORT=18074
```

`APP_SECRET` 同时用于会话签名和敏感配置加密。生产环境可使用 `openssl rand -hex 32` 生成随机值；更换该值后，已有密文配置无法解密，需要重新录入。

`DATABASE_URL` 仅支持本地 `file:` SQLite URL；默认值为 `file:./data/s2a-rate-bot.db`。

## 本地开发

```bash
npm ci
npm run dev
```

管理端默认地址为 `http://127.0.0.1:18074`。首次访问时，登录对话框会切换到管理员初始化流程。

可通过 `PORT` 手动指定 Web 端口，例如：

```bash
PORT=19000 npm run dev
```

PowerShell：

```powershell
$env:PORT='19000'; npm run dev
```

初始化后依次完成：

1. 在“全局配置”中保存目标站、代理和 Worker 参数。
2. 在“倍率采集”中添加采集站并执行远端刷新。
3. 在“分组倍率”中绑定采集源分组、预览并启用规则。
4. 在“账号调度”中刷新远端账号、启停调度、绑定采集分组并执行单个或批量通道测试；绑定时可启用“失败禁用、成功启用”的测试联动策略。

## Worker

Worker 是独立常驻进程，与 Next.js Web 进程共享同一个 SQLite 数据库和 `.env` 配置：

```bash
npm run worker
```

Worker 启动脚本会从项目根目录的 `.env` 加载 `APP_SECRET`、`DATABASE_URL` 等运行配置。

每轮运行会重新读取全局 Worker 间隔和并发数。收到 `SIGINT` 或 `SIGTERM` 后，进程会结束当前周期或等待并安全退出。

Worker 会每小时执行一次 SQLite 历史清理，仅保留最近 2 天的采集运行、倍率变化、Worker 运行记录和账号测试结果；采集站配置、账号绑定及最新状态快照会持续保留。删除过期数据后会压缩数据库并截断 WAL，避免数据库文件持续膨胀。首页“最近倍率变化”仅查询并展示最近 24 小时的数据。

Worker 每轮还会处理到期的定时抽奖。开奖会先锁定活动并持久化中奖计划，再逐项生成兑换码；失败会保留活动错误并在后续 Worker 周期从未完成项继续，不会伪装为成功。即时开奖按奖品独立中奖率抽取，未配置部分明确为未中奖，奖品耗尽不会重分配概率。

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

### PM2 部署

项目提供 Web 与 Worker 双进程 PM2 配置。生产服务器准备 `.env` 后执行：

```bash
npm ci
npm run build
npm run pm2:start
pm2 save
pm2 startup
```

PM2 默认使用端口 `18074`。临时指定端口：

```bash
PORT=19000 npm run pm2:start
```

也可以把 `PORT=19000` 写入项目 `.env`，然后正常执行 `npm run pm2:start`。

常用管理命令：

```bash
npm run pm2:reload
npm run pm2:stop
pm2 status
pm2 logs
```

`pm2:start` 会安装并配置 `pm2-logrotate`：单个 PM2 输出日志达到约 `2 MB` 时轮转，保留 5 份并压缩。系统业务日志 `external-api.log` 和 `worker.log` 同样在约 `2 MB` 时自动轮转，并保留最近 5 份归档；系统日志页面仅展示最近 2 天的有效记录。

PM2 已作为项目依赖安装，命令会直接使用 `node_modules/.bin/pm2`，不要求服务器全局安装 PM2。

### 自动部署脚本

项目根目录提供 `deploy.sh`，会依次拉取最新代码、安装依赖、构建项目，并启动或平滑重载 PM2 的 Web 与 Worker 进程：

```bash
chmod +x deploy.sh
./deploy.sh
```

执行前必须准备好项目根目录的 `.env`。脚本使用 `git pull --ff-only`，存在无法快进的提交或其他命令执行失败时会立即终止，并保留明确的错误输出。

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
- `/accounts`：远端账号状态与调度启停、采集分组绑定、测试联动策略和通道测试。
- `/settings`：目标站、代理和 Worker 配置。
- `/tickets`：嵌入工单配置、工单队列、状态与客服回复。
- `/lottery`：嵌入抽奖配置、活动管理与开奖结果。
- `/compensation`：联动小铺连接、补偿规则、活动状态和自动发码记录。
- `/leaderboard`：嵌入排行榜配置与 Sub2API 用量排名。
- `/embed/tickets`、`/embed/lottery`、`/embed/compensation`、`/embed/leaderboard`：供 Sub2API iframe 加载的用户界面。
- `/api/worker/status`：最近一轮 Worker 运行摘要。

所有管理 API 都要求有效登录会话。远端错误会作为明确错误返回，不会写入假成功状态。
