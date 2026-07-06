# S2A Rate Bot

`s2a-rate-bot` 是从 S2A Manager 抽离出来的新系统骨架，目标只保留倍率监听、目标倍率更新和 QQBot 交互。

## 范围

保留：

- 采集源倍率监听
- 源分组到目标分组的倍率规则
- 自动更新目标 Sub2API 分组倍率
- QQBot 倍率查询和倍率变动推送
- 少量 pub 配置界面

不迁移：

- 上游可用性检测
- 邀请活动
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
npm run api
npm run worker
npm run bot
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

## 已接入的真实接口

```text
GET /api/app-config
```

读取数据库中的目标站点、机器人、代理、目标分组、分组规则、采集站余额和采集站倍率快照。

```text
POST /api/settings/target
POST /api/settings/bot
POST /api/settings/proxy
POST /api/groups/rule
```

保存设置页和分组页数据到本地 SQLite 数据库。

```text
POST /api/target/groups
```

读取目标 Sub2API 站点分组，参数：`baseUrl`、`adminApiKey`。成功后会写入目标分组快照。

```text
POST /api/target/group-rate
```

更新目标 Sub2API 分组倍率，参数：`baseUrl`、`adminApiKey`、`groupId`、`rateMultiplier`。成功后会写入目标分组快照。

```text
POST /api/source/rates
```

读取采集站倍率，参数：`sourceSiteId`、`siteType`、`baseUrl`、`accessToken`、`rechargeRatio`。

```text
POST /api/source/overview
```

读取采集站余额和分组倍率，成功后会写入采集站配置、余额和倍率快照。认证支持账号密码、Access Token 或 RT Token。

`siteType` 支持：

- `sub2api`：读取 `/api/v1/groups/available` 和 `/api/v1/groups/rates`
- `newapi`：读取 `/api/pricing`

`worker` 和 `bot` 当前只暴露明确的未接入错误。接入 SQLite 存储编排和 NapCat 后再启用真实进程。
