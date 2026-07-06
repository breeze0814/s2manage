# S2A Rate Bot 迁移实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在当前仓库下创建 `s2a-rate-bot/`，抽离倍率监听、目标倍率更新和 QQBot 交互的最小新系统。

**架构：** 新项目采用 Node.js + TypeScript，拆分为 `core`、`adapters`、`storage`、`worker`、`bot`、`api` 和 `ui`。核心倍率与 Bot 命令逻辑保持纯函数，worker/bot/api 只做编排和副作用。

**技术栈：** TypeScript、Node test runner、tsx、Node SQLite、静态 pub 界面。

---

## 文件结构

- `src/core/rates.ts`：倍率归一化、比较和格式化。
- `src/core/rate-rule.ts`：倍率规则计算、目标更新决策。
- `src/bot/command.ts`：QQBot @ 指令解析。
- `src/bot/messages.ts`：倍率查询和变更推送消息构造。
- `src/api/server.ts`：托管 pub 静态界面和最小 JSON API。
- `src/worker/main.ts`：倍率监听 worker 入口骨架。
- `src/bot/main.ts`：QQBot 进程入口骨架。
- `src/adapters/sub2api-admin.ts`：目标 Sub2API adapter 边界。
- `src/adapters/source-rates.ts`：源倍率 adapter 边界。
- `src/storage/schema.ts`：worker 存储接口类型。
- `src/storage/sqlite-*.ts`：新系统本地 SQLite 数据库初始化、读写和应用配置持久化。
- `ui/index.html`、`ui/styles.css`、`ui/app.js`：pub 管理界面。
- `tests/rate-rule.test.ts`、`tests/bot-command.test.ts`：核心行为测试。

## 任务

- [ ] 任务 1：写倍率规则失败测试并验证红灯。
- [ ] 任务 2：实现 `core/rates.ts` 和 `core/rate-rule.ts` 让倍率测试通过。
- [ ] 任务 3：写 QQBot 命令失败测试并验证红灯。
- [ ] 任务 4：实现 `bot/command.ts` 和 `bot/messages.ts` 让 Bot 测试通过。
- [ ] 任务 5：创建 API、worker、bot 进程骨架和 adapter 接口。
- [ ] 任务 6：创建 pub 静态界面，遵循 ui-ux-pro-max 的运维仪表盘设计约束。
- [ ] 任务 7：创建 SQLite 存储和 README，运行测试与类型检查。
