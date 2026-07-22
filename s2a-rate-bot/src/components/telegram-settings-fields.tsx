"use client";

import * as Switch from "@radix-ui/react-switch";
import { Loader2, Send } from "lucide-react";

export type TelegramFormValue = {
  readonly botToken: string;
  readonly chatId: string;
  readonly hourlyBalanceEnabled: boolean;
  readonly rateChangeEnabled: boolean;
};

export function TelegramSettingsFields(input: Readonly<{
  value: TelegramFormValue;
  hasBotToken: boolean;
  testing: boolean;
  disabled: boolean;
  onChange: (value: TelegramFormValue) => void;
  onTest: () => void;
}>) {
  const update = <K extends keyof TelegramFormValue>(key: K, value: TelegramFormValue[K]) => {
    input.onChange({ ...input.value, [key]: value });
  };
  return (
    <div className="space-y-4">
      <TelegramField label="Bot Token" hint={input.hasBotToken ? "已加密保存，留空表示不修改。" : "从 BotFather 获取。"}>
        <input type="password" autoComplete="new-password" value={input.value.botToken}
          onChange={(event) => update("botToken", event.target.value)} className="form-control" />
      </TelegramField>
      <TelegramField label="Chat ID" hint="支持私聊、群组或频道 Chat ID。">
        <input value={input.value.chatId} onChange={(event) => update("chatId", event.target.value)}
          placeholder="-1001234567890" className="form-control" />
      </TelegramField>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface-muted/50 px-3">
        <TelegramSwitch label="每小时推送账户余额" checked={input.value.hourlyBalanceEnabled}
          onChange={(checked) => update("hourlyBalanceEnabled", checked)} />
        <TelegramSwitch label="分组倍率变动推送" checked={input.value.rateChangeEnabled}
          onChange={(checked) => update("rateChangeEnabled", checked)} />
      </div>
      <button type="button" onClick={input.onTest} disabled={input.disabled} className="secondary-button w-full sm:w-auto">
        {input.testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}发送测试消息
      </button>
    </div>
  );
}

function TelegramSwitch(input: Readonly<{ label: string; checked: boolean; onChange: (checked: boolean) => void }>) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium text-foreground">{input.label}</span>
      <Switch.Root aria-label={input.label} checked={input.checked} onCheckedChange={input.onChange}
        className="h-6 w-11 shrink-0 cursor-pointer rounded-full bg-border-strong p-0.5 transition-colors data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}

function TelegramField(input: Readonly<{ label: string; hint: string; children: React.ReactNode }>) {
  return (
    <label className="block space-y-2 text-sm font-medium text-foreground">
      <span>{input.label}</span>{input.children}<span className="block text-xs font-normal text-muted">{input.hint}</span>
    </label>
  );
}
