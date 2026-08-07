"use client";

import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import type { NotificationChannelSettings } from "../server/notifications/types.ts";

type Props = { value: NotificationChannelSettings; onChange: (value: NotificationChannelSettings) => void; disabled: boolean };
const labels = { dingtalk: "钉钉", wecom: "企业微信", qq: "QQ", feishu: "飞书", telegram: "Telegram" } as const;

export function NotificationChannelsFields({ value, onChange, disabled }: Props) {
  const [active, setActive] = useState<keyof NotificationChannelSettings>("dingtalk");
  const [testing, setTesting] = useState<string | null>(null);
  const channel = value[active];
  const add = () => {
    const id = `${active}-${Date.now()}`;
    const bot = active === "telegram" ? { id, name: "Telegram 机器人", enabled: false, botToken: "", chatId: "", proxyUrl: "" }
      : active === "qq" ? { id, name: "QQ 机器人", enabled: false, appId: "", clientSecret: "", userOpenId: "" }
      : { id, name: `${labels[active]}机器人`, enabled: false, webhook: "", ...(active === "dingtalk" || active === "feishu" ? { secret: "" } : {}) };
    onChange({ ...value, [active]: [...channel, bot] } as NotificationChannelSettings);
  };
  const update = (index: number, patch: Record<string, unknown>) => onChange({ ...value, [active]: channel.map((bot, item) => item === index ? { ...bot, ...patch } : bot) } as NotificationChannelSettings);
  const remove = (index: number) => onChange({ ...value, [active]: channel.filter((_bot, item) => item !== index) } as NotificationChannelSettings);
  const test = async (bot: Record<string, unknown>) => {
    setTesting(String(bot.id));
    try {
      const response = await fetch("/api/settings/notification-channels/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: active, ...bot }) });
      const body = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "机器人测试失败");
      toast.success(body.message ?? "机器人测试消息已发送");
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setTesting(null); }
  };
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{(Object.keys(labels) as (keyof NotificationChannelSettings)[]).map((item) => <Button key={item} type="button" variant={active === item ? "secondary" : "ghost"} onClick={() => setActive(item)}>{labels[item]}</Button>)}</div>
    <div className="space-y-3">{channel.map((bot, index) => <BotCard key={String(bot.id)} bot={bot as Record<string, unknown>} testing={testing === String(bot.id)} disabled={disabled} onUpdate={(patch) => update(index, patch)} onRemove={() => remove(index)} onTest={() => void test(bot as Record<string, unknown>)} />)}</div>
    <Button type="button" variant="secondary" onClick={add} disabled={disabled}><Plus className="size-4" />新增{labels[active]}机器人</Button>
  </div>;
}

function BotCard({ bot, testing, disabled, onUpdate, onRemove, onTest }: { bot: Record<string, unknown>; testing: boolean; disabled: boolean; onUpdate: (patch: Record<string, unknown>) => void; onRemove: () => void; onTest: () => void }) {
  const field = (key: string, label: string, type = "text") => <Label className="block space-y-1 text-sm"><span>{label}</span><Input type={type} value={String(bot[key] ?? "")} onChange={(event) => onUpdate({ [key]: event.target.value })} disabled={disabled} /></Label>;
  return <div className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><Input className="min-w-48 max-w-xs flex-1" placeholder="机器人名称" value={String(bot.name ?? "")} onChange={(event) => onUpdate({ name: event.target.value })} disabled={disabled} /><div className="flex items-center gap-2"><Switch aria-label="启用机器人" checked={Boolean(bot.enabled)} onCheckedChange={(checked) => onUpdate({ enabled: checked })} disabled={disabled} /><Button type="button" variant="ghost" onClick={onRemove} disabled={disabled} title="删除机器人"><Trash2 className="size-4" /></Button><Button type="button" variant="secondary" onClick={onTest} disabled={disabled || testing}>{testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}测试</Button></div></div>
    {"webhook" in bot ? field("webhook", "Webhook URL", "url") : null}
    {"hasWebhook" in bot && !bot.webhook ? <p className="text-xs text-muted">Webhook 已安全保存，留空表示不修改。</p> : null}
    {"secret" in bot ? field("secret", "签名密钥", "password") : null}
    {"hasSecret" in bot && !bot.secret ? <p className="text-xs text-muted">签名密钥已安全保存，留空表示不修改。</p> : null}
    {"botToken" in bot ? <div className="grid gap-3 sm:grid-cols-2">{field("botToken", "Bot Token", "password")}{field("chatId", "Chat ID")}{field("proxyUrl", "代理地址")}</div> : null}
    {"hasBotToken" in bot && !bot.botToken ? <p className="text-xs text-muted">Bot Token 已安全保存，留空表示不修改。</p> : null}
    {"appId" in bot ? <div className="grid gap-3 sm:grid-cols-3">{field("appId", "App ID")}{field("clientSecret", "App Secret", "password")}{field("userOpenId", "User OpenID")}</div> : null}
    {"hasClientSecret" in bot && !bot.clientSecret ? <p className="text-xs text-muted">App Secret 已安全保存，留空表示不修改。</p> : null}
  </div>;
}
