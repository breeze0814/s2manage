import { z } from "zod";

export const notificationChannelSchema = z.enum(["dingtalk", "wecom", "qq", "feishu", "telegram"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

const baseBotSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean(),
});

const webhookSchema = z.string().trim().refine((value) => !value || /^https?:\/\//i.test(value), "Webhook URL 必须使用 http:// 或 https://");
export const dingtalkBotSchema = baseBotSchema.extend({ webhook: webhookSchema, secret: z.string().trim() });
export const wecomBotSchema = baseBotSchema.extend({ webhook: webhookSchema });
export const feishuBotSchema = baseBotSchema.extend({ webhook: webhookSchema, secret: z.string().trim() });
export const telegramBotSchema = baseBotSchema.extend({
  botToken: z.string().trim().refine((value) => !value || /^\d+:[A-Za-z0-9_-]+$/.test(value), "Telegram Bot Token 格式无效"),
  chatId: z.string().trim(),
  proxyUrl: z.string().trim().optional().default(""),
});
export const qqBotSchema = baseBotSchema.extend({
  appId: z.string().trim(),
  clientSecret: z.string().trim(),
  userOpenId: z.string().trim(),
});

export const notificationChannelSettingsSchema = z.object({
  dingtalk: z.array(dingtalkBotSchema).default([]),
  wecom: z.array(wecomBotSchema).default([]),
  qq: z.array(qqBotSchema).default([]),
  feishu: z.array(feishuBotSchema).default([]),
  telegram: z.array(telegramBotSchema).default([]),
});

export type DingtalkBot = z.infer<typeof dingtalkBotSchema>;
export type WecomBot = z.infer<typeof wecomBotSchema>;
export type FeishuBot = z.infer<typeof feishuBotSchema>;
export type TelegramBot = z.infer<typeof telegramBotSchema>;
export type QQBot = z.infer<typeof qqBotSchema>;
export type NotificationChannelSettings = z.infer<typeof notificationChannelSettingsSchema>;

export type NotificationMessageFormat = "text" | "markdown" | "html";

export type NotificationChannelSettingsInput = {
  readonly channel: NotificationChannel;
  readonly id?: string;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly webhook?: string;
  readonly secret?: string;
  readonly botToken?: string;
  readonly chatId?: string;
  readonly proxyUrl?: string;
  readonly appId?: string;
  readonly clientSecret?: string;
  readonly userOpenId?: string;
};
