import { z } from "zod";
import { requestJson, type JsonRequest } from "./http-client.ts";

const telegramRequestSchema = z.object({
  botToken: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]+$/, "Telegram Bot Token 格式无效"),
  chatId: z.string().trim().min(1, "Telegram Chat ID 不能为空"),
  text: z.string().min(1, "Telegram 消息不能为空"),
  timeoutMs: z.number().int().positive(),
  proxyUrl: z.string().nullable(),
});

const telegramResponseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
});

export type TelegramMessageInput = z.infer<typeof telegramRequestSchema>;
export type TelegramBotClient = {
  readonly sendMessage: (input: TelegramMessageInput) => Promise<void>;
};

export function createTelegramBotClient(input: {
  readonly request: <T>(request: JsonRequest) => Promise<T>;
} = { request: requestJson }): TelegramBotClient {
  return { sendMessage: (message) => sendTelegramMessage(input.request, message) };
}

async function sendTelegramMessage(
  request: <T>(input: JsonRequest) => Promise<T>,
  raw: TelegramMessageInput,
) {
  const message = telegramRequestSchema.parse(raw);
  const response = telegramResponseSchema.parse(await request<unknown>({
    url: `https://api.telegram.org/bot${message.botToken}/sendMessage`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { chat_id: message.chatId, text: message.text, disable_web_page_preview: true },
    timeoutMs: message.timeoutMs,
    proxyUrl: message.proxyUrl,
  }));
  if (!response.ok) throw new Error(response.description ?? "Telegram Bot API 返回失败");
}
