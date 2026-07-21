"use client";

import { Bot, Globe2, RadioTower, ShieldCheck } from "lucide-react";

export type SettingsSection = "target" | "proxy" | "worker" | "telegram";

const ITEMS: readonly { readonly id: SettingsSection; readonly label: string; readonly description: string; readonly icon: typeof Globe2 }[] = [
  { id: "target", label: "目标站", description: "Sub2API 接口", icon: Globe2 },
  { id: "proxy", label: "全局代理", description: "统一请求出口", icon: ShieldCheck },
  { id: "worker", label: "Worker", description: "任务运行参数", icon: RadioTower },
  { id: "telegram", label: "Telegram", description: "推送通知", icon: Bot },
];

export function SettingsNavigation(input: Readonly<{ active: SettingsSection; onChange: (section: SettingsSection) => void }>) {
  return (
    <nav aria-label="全局配置分类" className="min-w-0">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === input.active;
          return (
            <button key={item.id} type="button" aria-current={active ? "page" : undefined} aria-pressed={active}
              onClick={() => input.onChange(item.id)} title={item.description}
              className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="block truncate text-xs opacity-75">{item.description}</span></span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
