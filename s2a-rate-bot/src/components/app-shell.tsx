"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Gauge, RadioTower, Settings, Users } from "lucide-react";

const navigation = [
  { href: "/groups", label: "分组倍率", icon: Gauge },
  { href: "/sources", label: "倍率采集", icon: RadioTower },
  { href: "/accounts", label: "账号调度", icon: Users },
  { href: "/settings", label: "全局配置", icon: Settings },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold tracking-tight">S2A Rate Bot</p>
              <p className="text-sm text-slate-500">倍率采集与自动调度</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              Worker 未连接
            </span>
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
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
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
