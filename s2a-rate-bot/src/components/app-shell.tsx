"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Gauge, RadioTower, Settings, Users } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/groups", label: "分组倍率", icon: Gauge },
  { href: "/sources", label: "倍率采集", icon: RadioTower },
  { href: "/accounts", label: "账号调度", icon: Users },
  { href: "/settings", label: "全局配置", icon: Settings },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold tracking-tight">S2A Rate Bot</p>
              <p className="text-sm text-muted">倍率采集与自动调度</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-muted">Worker 未连接</span>
              <ThemeToggle />
            </div>
          </div>
          <nav aria-label="主导航" className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-surface/80 text-muted hover:border-border-strong hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
