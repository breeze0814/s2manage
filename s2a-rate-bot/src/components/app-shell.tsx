"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CircleDot } from "lucide-react";
import { SettingsDialog } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/", label: "首页" },
  { href: "/groups", label: "分组倍率" },
  { href: "/sources", label: "倍率采集" },
  { href: "/accounts", label: "账号调度" },
  { href: "/logs", label: "系统日志" },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#main-content" className="fixed left-4 top-4 z-40 -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0">跳到主要内容</a>
      <TopNavigation pathname={pathname} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

function TopNavigation({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <header className="sticky top-0 z-40 pt-2">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-sm backdrop-blur-xl">
          <div className="hidden min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-5 md:grid lg:px-6">
            <div className="justify-self-start"><Brand /></div>
            <nav aria-label="主导航" className="flex items-center gap-1 justify-self-center"><Navigation pathname={pathname} /></nav>
            <div className="justify-self-end"><HeaderActions /></div>
          </div>
          <div className="md:hidden">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4"><Brand /><HeaderActions compact /></div>
            <nav aria-label="移动端主导航" className="flex justify-center gap-1 overflow-x-auto border-t border-border px-2 py-2"><Navigation pathname={pathname} mobile /></nav>
          </div>
        </div>
      </div>
    </header>
  );
}

function Navigation({ pathname, mobile = false }: Readonly<{ pathname: string; mobile?: boolean }>) {
  return navigation.map((item) => {
    const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm transition-colors duration-200 ${mobile ? "justify-center" : ""} ${active ? "font-semibold text-foreground" : "font-medium text-muted hover:bg-surface-muted hover:text-foreground"}`}>
        {item.label}
      </Link>
    );
  });
}

function Brand() {
  return (
    <Link href="/" aria-label="S2A Rate Bot 首页" className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-[17px] font-semibold tracking-[-0.035em] text-foreground transition-opacity hover:opacity-80">
      <span>S2A</span><span>Rate</span><span>Bot</span><span aria-hidden="true" className="ml-1.5 size-1.5 rounded-full bg-primary" />
    </Link>
  );
}

function HeaderActions({ compact = false }: Readonly<{ compact?: boolean }>) {
  return <div className="flex items-center gap-2"><WorkerBadge compact={compact} /><SettingsDialog /><ThemeToggle /></div>;
}

function WorkerBadge({ compact = false }: Readonly<{ compact?: boolean }>) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/worker/status", { cache: "no-store" });
        if (!response.ok) throw new Error(`Worker 状态请求失败 HTTP ${response.status}`);
        const body = await response.json() as { connection?: { connected?: boolean } };
        if (active) setConnected(body.connection?.connected === true);
      } catch (error) {
        if (active) setConnected(false);
        console.error("读取 Worker 连接状态失败", error);
      }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (compact) return null;
  return <span className={`hidden min-h-8 items-center gap-2 rounded-full border px-3 text-xs lg:inline-flex ${connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-surface-muted text-muted"}`}><CircleDot className="size-3.5" aria-hidden="true" />{connected ? "Worker 已连接" : "Worker 未连接"}</span>;
}
