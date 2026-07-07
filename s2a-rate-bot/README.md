# S2A Rate Bot

`s2a-rate-bot` 是从 S2A Manager 抽离出来的新系统骨架，目标只保留倍率监听、目标倍率更新和 QQBot 交互。

## 范围

保留：

- 采集源倍率监听
- 源分组到目标分组的倍率规则
- 自动更新目标 Sub2API 分组倍率
- QQBot 被动指令、主动私聊和邀请活动定时统计
- 少量 pub 配置界面

不迁移：

- 上游可用性检测
- 余额告警
- 公告系统
- 完整运维管理台

## 结构

```text
src/core      纯业务逻辑
src/adapters 远端系统接入边界
src/storage  存储接口类型
src/worker   倍率监听进程入口
src/bot      QQBot 进程入口
src/api      HTTP API 和 pub 静态界面托管
ui           pub 静态界面
```

## 命令

```bash
npm test
npm run typecheck
npm run dev
npm run api
npm run worker
npm run bot
```

本地开发：

```bash
npm run dev
```

会同时启动 API、worker 和 bot 三个进程。也可以按需单独启动：

```bash
npm run dev:api
npm run dev:worker
npm run dev:bot
```

API 默认监听：

```text
http://127.0.0.1:18074
```

默认数据库：

```text
file:./data/s2a-rate-bot.db
```

可以通过 `DATABASE_URL=file:/absolute/path/app.db` 指定其他本地 SQLite 文件。当前只支持 `file:` SQLite URL；非本地数据库 URL 会明确报错。

## PM2 部署

```bash
npm run pm2:start
npm run pm2:restart
npm run pm2:logs
npm run pm2:stop
npm run pm2:delete
```

PM2 使用 `ecosystem.config.cjs` 托管三个独立进程：

```text
s2a-rate-bot-api
s2a-rate-bot-worker
s2a-rate-bot-bot
```

默认生产环境变量：

```text
HOST=127.0.0.1
PORT=18074
DATABASE_URL=file:./data/s2a-rate-bot.db
S2A_BOT_STATS_INTERVAL_SECONDS=3600
```

日志写入：

```text
logs/pm2-api-out.log
logs/pm2-api-error.log
logs/pm2-worker-out.log
logs/pm2-worker-error.log
logs/pm2-bot-out.log
logs/pm2-bot-error.log
```

## 已接入的真实接口

```text
GET /api/app-config
```

读取数据库中的目标站点、机器人、代理、worker、目标分组、分组规则、采集站余额和采集站倍率快照。接口会脱敏返回密钥字段：

- `target.adminApiKey` 固定返回空字符串，通过 `target.adminApiKeySet` 表示是否已保存。
- `bot.token` 固定返回空字符串，通过 `bot.tokenSet` 表示是否已保存。
- 采集站 `accessToken`、`rtToken`、`password` 固定返回空字符串，通过对应 `*Set` 字段表示是否已保存。

```text
POST /api/settings/target
POST /api/settings/proxy
POST /api/settings/worker
POST /api/groups/rule
```

保存目标站点、代理、worker 和分组规则到本地 SQLite 数据库。`/api/settings/target` 支持：

- `adminApiKey` 为空时复用已保存密钥。
- `clearAdminApiKey: true` 时清空已保存密钥。

Bot 配置拆分为独立设置接口：

```text
POST /api/settings/bot/connection
POST /api/settings/bot/commands
POST /api/settings/bot/active
POST /api/settings/bot/invite-activity
```

- `connection` 保存 Bot 启用状态、NapCat WebSocket、Token、目标群、Bot QQ；`token` 为空时复用已保存 Token，`clearToken: true` 时清空 Token。
- `commands` 保存 `@bot` 总开关和每个指令的独立开关。
- `active` 保存主动私聊开关。
- `invite-activity` 保存邀请活动开关、开始日期、活跃/非活跃奖励金额。

兼容接口 `POST /api/settings/bot` 仍可一次性保存完整 Bot 配置。

```text
POST /api/target/groups
```

读取目标 Sub2API 站点分组，参数：`baseUrl`、`adminApiKey`。密钥字段为空时会复用本地保存的目标站点配置。成功后会写入目标分组快照。

```text
POST /api/target/group-rate
```

更新目标 Sub2API 分组倍率，参数：`baseUrl`、`adminApiKey`、`groupId`、`rateMultiplier`。密钥字段为空时会复用本地保存的目标站点配置。成功后会写入目标分组快照。

```text
POST /api/target/accounts
POST /api/target/account-schedulable
```

读取目标 Sub2API 用户列表，或更新用户是否可被邀请活动结算。目标站点配置同样支持复用本地保存的 `baseUrl` 和 `adminApiKey`。

```text
POST /api/source/rates
```

读取采集站倍率，参数：`sourceSiteId`、`siteType`、`baseUrl`、`authMode`、`accessToken`、`rtToken`、`username`、`password`、`rechargeRatio`。认证字段为空时会复用该采集站已保存的认证信息。

```text
POST /api/source/overview
```

读取采集站余额和分组倍率，成功后会写入采集站配置、余额和倍率快照。认证支持账号密码、Access Token 或 RT Token。

`siteType` 支持：

- `sub2api`：读取 `/api/v1/groups/available` 和 `/api/v1/groups/rates`
- `newapi`：读取 `/api/pricing`

```text
POST /api/groups/apply-rule
```

按已保存的分组规则把采集站倍率同步到目标 Sub2API 分组。

```text
POST /api/bot/invite-activity
```

预览邀请活动当前三日周期、待结算周期、奖励划分和排行榜。目标站点密钥为空时复用本地保存配置。

```text
GET /api/status
GET /api/runtime/events
```

`/api/status` 返回 API、worker、bot 三个状态指示；状态会同时参考本地配置和最近运行事件，worker/bot 最近一次失败会显示为 `error`。`/api/runtime/events` 返回最近 30 条运行事件，用于界面展示 worker/bot 启动、定时任务成功和失败记录。

## QQBot 能力

`bot` 进程读取本地 SQLite 中的目标站点配置和 Bot 配置，连接 NapCat WebSocket 后提供三类能力：

- 被动 `@bot` 指令：`help` / `帮助`、`分组` / `倍率` / `当前分组倍率`、`绑定 <邮箱>`、`解绑`、`邀请`、`我的邀请`、`邀请排行`。
- 主动私聊：邀请活动结算生成兑换码后，向已绑定 QQ 的邀请人发送私聊奖励消息。
- 定时统计：邀请活动开启后按活动开始日期滚动三日周期结算；调度器按 `S2A_BOT_STATS_INTERVAL_SECONDS` 轮询检查，默认 3600 秒。

邀请活动奖励配置从 Bot 邀请活动设置读取：

```text
inviteActivityStartDate
inviteActivityActiveRewardAmount
inviteActivityInactiveRewardAmount
```
