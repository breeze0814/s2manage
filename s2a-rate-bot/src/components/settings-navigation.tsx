"use client";

import { Bot, Globe2, RadioTower, ShieldCheck, BellRing } from "lucide-react";
import { Button } from "./ui/button";

export type SettingsSection = "target" | "proxy" | "worker" | "telegram" | "bots";

const ITEMS: readonly { readonly id: SettingsSection; readonly label: string; readonly description: string; readonly icon: typeof Globe2 }[] = [
  { id: "target", label: "目标站", description: "Sub2API 接口", icon: Globe2 },
  { id: "proxy", label: "全局代理", description: "统一请求出口", icon: ShieldCheck },
  { id: "worker", label: "Worker", description: "任务运行参数", icon: RadioTower },
  { id: "telegram", label: "Telegram", description: "推送通知", icon: Bot },
  { id: "bots", label: "机器人", description: "多通道通知", icon: BellRing },
];

export function SettingsNavigation(input: Readonly<{
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
  sidebar?: boolean;
  dialogWide?: boolean;
}>) {
  const navigationClass = input.sidebar
    ? "min-w-0 lg:sticky sticky-below-header lg:border-r lg:border-border lg:pr-5"
    : input.dialogWide
      ? "min-w-0 2xl:border-r 2xl:border-border 2xl:pr-5"
      : "min-w-0";
  const layout = input.sidebar
    ? "grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5 lg:grid-cols-1"
    : input.dialogWide
      ? "grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-1"
      : "grid grid-cols-2 gap-2 sm:grid-cols-4";
  return (
    <nav aria-label="全局配置分类" className={navigationClass}>
      <div className={layout}>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === input.active;
          return (
            <Button key={item.id} type="button" variant="ghost" aria-current={active ? "page" : undefined} aria-pressed={active}
              onClick={() => input.onChange(item.id)} title={item.description}
              className={`min-h-11 min-w-0 justify-start gap-3 px-3 py-2 text-left ${active ? "border-primary/25 bg-primary/15 text-primary-strong shadow-sm" : "text-muted"}`}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="block truncate text-xs opacity-75">{item.description}</span></span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
