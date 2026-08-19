import { createHash, createHmac } from "node:crypto";
import { requestJson } from "../../adapters/http-client.ts";
import type { JsonRequest } from "../../adapters/http-client.ts";
import type { NotificationChannelSettings, NotificationMessageFormat, NotificationChannelSettingsInput } from "./types.ts";

const DEFAULT_QQ_API = "https://api.sgroup.qq.com";
const DEFAULT_QQ_TOKEN = "https://bots.qq.com/app/getAppAccessToken";

export type NotificationDispatcher = {
  readonly send: (message: string, format?: NotificationMessageFormat) => Promise<NotificationDelivery>;
  readonly test: (input: NotificationChannelSettingsInput) => Promise<void>;
};

export type NotificationDelivery = {
  readonly sent: number;
  readonly failed: readonly string[];
};

export function createNotificationDispatcher(input: {
  readonly settings: () => Promise<NotificationChannelSettings>;
  readonly timeoutMs: () => Promise<number>;
  readonly proxyUrl: () => Promise<string | null>;
  readonly request?: <T>(request: JsonRequest) => Promise<T>;
}): NotificationDispatcher {
  const request = input.request ?? requestJson;
  const qqTokens = new Map<string, { token: string; secretHash: string; expiresAt: number }>();
  return {
    send: async (message, format = "text") => {
      const settings = await input.settings();
      const timeoutMs = await input.timeoutMs();
      const proxyUrl = await input.proxyUrl();
      const jobs = [
        ...settings.dingtalk.filter((bot) => bot.enabled).map((bot) => () => sendDingtalk(request, bot.webhook, bot.secret, message, format, timeoutMs, proxyUrl)),
        ...settings.wecom.filter((bot) => bot.enabled).map((bot) => () => sendWecom(request, bot.webhook, message, format, timeoutMs, proxyUrl)),
        ...settings.feishu.filter((bot) => bot.enabled).map((bot) => () => sendFeishu(request, bot.webhook, bot.secret, message, format, timeoutMs, proxyUrl)),
        ...settings.telegram.filter((bot) => bot.enabled).map((bot) => () => sendTelegram(request, bot, message, format, timeoutMs, proxyUrl)),
        ...settings.qq.filter((bot) => bot.enabled).map((bot) => () => sendQQ(request, bot, message, format, timeoutMs, proxyUrl, qqTokens)),
      ];
      if (!jobs.length) return { sent: 0, failed: [] };
      const results = await Promise.allSettled(jobs.map((job) => job()));
      return results.reduce<NotificationDelivery>((result, item) => item.status === "fulfilled"
        ? { sent: result.sent + 1, failed: result.failed }
        : { sent: result.sent, failed: [...result.failed, errorMessage(item.reason)] }, { sent: 0, failed: [] });
    },
    test: async (raw) => {
      const timeoutMs = await input.timeoutMs();
      const proxyUrl = await input.proxyUrl();
      const message = `【S2A Rate Bot】通知测试\n时间：${formatTime(new Date())}\n\n通知通道连接正常。`;
      switch (raw.channel) {
        case "dingtalk": return sendDingtalk(request, required(raw.webhook), raw.secret ?? "", message, "text", timeoutMs, proxyUrl);
        case "wecom": return sendWecom(request, required(raw.webhook), message, "text", timeoutMs, proxyUrl);
        case "feishu": return sendFeishu(request, required(raw.webhook), raw.secret ?? "", message, "text", timeoutMs, proxyUrl);
        case "telegram": return sendTelegram(request, { id: "test", name: "test", enabled: true, botToken: required(raw.botToken), chatId: required(raw.chatId), proxyUrl: raw.proxyUrl ?? "" }, message, "text", timeoutMs, raw.proxyUrl?.trim() || proxyUrl);
        case "qq": return sendQQ(request, { id: "test", name: "test", enabled: true, appId: required(raw.appId), clientSecret: required(raw.clientSecret), userOpenId: required(raw.userOpenId) }, message, "text", timeoutMs, proxyUrl, qqTokens);
      }
    },
  };
}

async function sendDingtalk(request: <T>(request: JsonRequest) => Promise<T>, webhook: string, secret: string, message: string, format: NotificationMessageFormat, timeoutMs: number, proxyUrl: string | null) {
  let endpoint = required(webhook);
  if (secret.trim()) {
    const timestamp = Date.now().toString();
    const sign = createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
    endpoint += `${endpoint.includes("?") ? "&" : "?"}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }
  await postWebhook(request, endpoint, format === "text" ? { msgtype: "text", text: { content: message } } : { msgtype: "markdown", markdown: { title: "S2A Rate Bot", text: markdownForChannel(message, format) } }, timeoutMs, proxyUrl);
}

async function sendWecom(request: <T>(request: JsonRequest) => Promise<T>, webhook: string, message: string, format: NotificationMessageFormat, timeoutMs: number, proxyUrl: string | null) {
  await postWebhook(request, required(webhook), format === "text" ? { msgtype: "text", text: { content: message } } : { msgtype: "markdown", markdown: { content: markdownForChannel(message, format) } }, timeoutMs, proxyUrl);
}

async function sendFeishu(request: <T>(request: JsonRequest) => Promise<T>, webhook: string, secret: string, message: string, format: NotificationMessageFormat, timeoutMs: number, proxyUrl: string | null) {
  const body: Record<string, unknown> = format === "text"
    ? { msg_type: "text", content: { text: message } }
    : { msg_type: "interactive", card: { schema: "2.0", body: { elements: [{ tag: "markdown", content: markdownForChannel(message, format), text_align: "left" }] } } };
  if (secret.trim()) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
  }
  await postWebhook(request, required(webhook), body, timeoutMs, proxyUrl);
}

async function sendTelegram(request: <T>(request: JsonRequest) => Promise<T>, bot: NotificationChannelSettings["telegram"][number], message: string, format: NotificationMessageFormat, timeoutMs: number, proxyUrl: string | null) {
  const response = await request<{ ok?: boolean; description?: string }>({ url: `https://api.telegram.org/bot${bot.botToken}/sendMessage`, method: "POST", headers: { "content-type": "application/json" }, body: { chat_id: bot.chatId, text: format === "html" ? telegramHtml(message) : message, ...(format === "markdown" ? { parse_mode: "Markdown" } : format === "html" ? { parse_mode: "HTML" } : {}), disable_web_page_preview: true }, timeoutMs, proxyUrl: bot.proxyUrl?.trim() || proxyUrl });
  if (!response.ok) throw new Error(response.description ?? "Telegram Bot API 返回失败");
}

async function sendQQ(request: <T>(request: JsonRequest) => Promise<T>, bot: NotificationChannelSettings["qq"][number], message: string, format: NotificationMessageFormat, timeoutMs: number, proxyUrl: string | null, tokens: Map<string, { token: string; secretHash: string; expiresAt: number }>) {
  const secretHash = createHash("sha256").update(bot.clientSecret).digest("hex");
  const cached = tokens.get(bot.appId);
  let token = cached && cached.secretHash === secretHash && cached.expiresAt > Date.now() ? cached.token : "";
  if (!token) {
    const response = await request<{ access_token?: string; expires_in?: number | string }>({ url: DEFAULT_QQ_TOKEN, method: "POST", headers: { "content-type": "application/json" }, body: { appId: bot.appId, clientSecret: bot.clientSecret }, timeoutMs, proxyUrl });
    if (!response.access_token) throw new Error("QQ access token 获取失败");
    token = response.access_token;
    const expiresIn = Number(response.expires_in ?? 3600);
    tokens.set(bot.appId, { token, secretHash, expiresAt: Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn - 60 : 3600) * 1_000 });
  }
  const payload = format === "text" ? { msg_type: 0, content: message } : { msg_type: 2, content: message, markdown: { content: markdownForChannel(message, format) } };
  const response = await request<Record<string, unknown>>({ url: `${DEFAULT_QQ_API}/v2/users/${encodeURIComponent(bot.userOpenId)}/messages`, method: "POST", headers: { "content-type": "application/json", authorization: `QQBot ${token}`, "x-union-appid": bot.appId }, body: payload, timeoutMs, proxyUrl });
  if (Number(response.code ?? response.err_code ?? 0) !== 0) throw new Error(String(response.message ?? "QQ 消息发送失败"));
}

async function postWebhook(request: <T>(request: JsonRequest) => Promise<T>, url: string, body: Record<string, unknown>, timeoutMs: number, proxyUrl: string | null) {
  const response = await request<Record<string, unknown>>({ url, method: "POST", headers: { "content-type": "application/json" }, body, timeoutMs, proxyUrl });
  if (response.ok === false || Number(response.code ?? response.errcode ?? 0) !== 0) throw new Error(String(response.message ?? response.msg ?? "机器人接口返回失败"));
}

function markdownForChannel(message: string, format: NotificationMessageFormat) { return format === "html" ? message.replace(/<[^>]+>/g, "") : message; }
function telegramHtml(message: string) { return message.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""); }
function formatTime(value: Date) { return value.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
function required(value: string | undefined) { const normalized = value?.trim() ?? ""; if (!normalized) throw new Error("机器人配置不完整"); return normalized; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
