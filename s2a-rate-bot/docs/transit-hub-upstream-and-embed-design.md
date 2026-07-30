# Transit Hub 上游协议与嵌入界面设计

## 本次移植边界

Transit Hub 的 New API/Sub2API 远端协议已经移植到 `src/server/upstream-platform/client.ts`。它是 server-only 协议层，不直接依赖 React、Route Handler、SQLite 或现有目标账号/分组 service。

客户端覆盖以下操作族：

- New API：Cookie/系统访问令牌鉴权、管理员验权、当前用户、状态与倍率单位、用量/分组、Token CRUD、Channel CRUD、Channel key 临时读取、权重/状态/优先级更新、GroupRatio 更新、用户分页。
- Sub2API：账号登录与刷新、Admin API Key/JWT 鉴权、当前用户、用量/可用分组/专属倍率、管理分组与统计、Key CRUD、转发账号 CRUD/导出/字段级更新、用户列表/详情/余额历史/用量排行。

现有 `target-accounts` 和 `target-groups` 继续使用当前窄接口。后续接 UI 时应由 runtime/service 调用上游协议层，Route Handler 不应直接拼远端 URL。

## 工单嵌入的实际结构

Transit Hub 没有在自身页面里创建 iframe，也没有 SDK 或 `postMessage` 协议。`/embed/tickets` 本身就是给 Sub2API iframe 加载的目标页。Sub2API 负责拼入以下 query：

- `embed_token`：只用于定位 Transit Hub workspace/config。
- `token`：当前 Sub2API 用户的原始访问令牌。
- `user_id`：可选的交叉校验值，不能作为可信身份。
- `src_host`：Sub2API 站点 origin。
- `src_url`：当前来源页面，用于业务记录或返回链接。
- `theme`、`lang`：纯展示参数。

嵌入页初始化后把这些值 POST 到 `/api/embed/tickets/session`。成功后立即从地址栏删除 `token`，只在内存中保留返回的短期 `sessionToken`；列表、创建、详情、回复和附件请求都改用 `Authorization: Bearer <sessionToken>`。

## 如何取得当前登录的 Sub2API 用户

不能从 iframe 的 Transit Hub 登录态、URL 中的 `user_id` 或未经验证的 JWT payload 推断用户。可信链路是：

1. Sub2API 父页面把当前用户 token 作为首次加载参数交给嵌入页。
2. Transit Hub 后端规范化并校验 `src_host`。
3. 后端请求 `GET <src_host>/api/v1/auth/me`，请求头为 `Authorization: Bearer <原始 token>`。
4. 从 `data`（兼容顶层）读取 `id/user_id/userId`、`email`、`role`。
5. 如果 URL 同时带了 `user_id`，只把它用作一致性校验；不一致就拒绝。
6. 后端生成随机、短期、不可预测的 embed session，把 workspace、规范化后的来源 host 和 Sub2API 用户身份写入服务端会话存储。
7. 原始 Sub2API token 不写数据库、不写日志、不放进 embed session，也不再返回前端。

本仓库的 `createSub2ApiClient(...).fetchCurrentUser()` 已实现第 3、4 步，调用的就是 `/api/v1/auth/me`。

## 必须保留的安全边界

- `embed_token` 是 workspace locator，不是用户凭证。
- `src_host` 来自浏览器，必须限制到 `http/https`，并在真正提供嵌入功能时增加域名 allowlist、DNS/IP 私网拦截和重定向复检，避免 SSRF。
- 首次 URL 带 token 有泄漏面。嵌入页必须尽早交换并 `history.replaceState` 清除；响应设置严格 `Referrer-Policy: no-referrer`，页面不得加载不受控第三方资源。
- Embed session 建议 30 分钟 TTL；服务端只保存身份快照和 workspace 归属，不保存上游 token。
- 每次工单读写都用 `workspace + srcHost + sub2apiUserId` 过滤，不能只按 ticket ID 查询。
- 附件下载同样先校验 session 和 ticket 归属；图片通常要通过带 Bearer 的 `fetch` 获取 Blob，不能直接用无法附加鉴权头的公开 URL。
- New API 的 Channel key 和 Sub2API 的账号导出凭据只能在服务端内存中短暂使用，不落库、不返回管理页面、不写错误文本。

## 当前实现

本仓库现已完成工单、排行榜和抽奖三类嵌入功能：

- SQLite 保存 embed config、工单/消息/附件、抽奖活动/报名/结果；短期会话使用 30 分钟 JWT，不保存原始 Sub2API token。
- `/embed/tickets`、`/embed/leaderboard`、`/embed/lottery` 在 iframe 中独立渲染，不加载管理端登录壳层。
- `/api/embed/*/session` 通过目标站 `/api/v1/auth/me` 验证用户，并把 `src_host` 强制绑定到管理员当前配置的目标站 origin，浏览器提供的任意地址不会成为服务端请求目标。
- 工单、附件和抽奖用户态查询均使用来源站与 Sub2API 用户 ID 约束；附件只通过带管理会话或 embed Bearer 的受权接口读取。
- Worker 每轮处理到期定时抽奖：先锁定开奖活动并保存中奖计划，再生成兑换码；错误保存在活动状态中并由后续周期继续处理。即时开奖使用奖品独立中奖率，剩余概率表示未中奖。
