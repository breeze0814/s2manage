"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CircleDot, Database, Home, Layers3, ScrollText, UsersRound } from "lucide-react";
import { SettingsDialog } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/", label: "首页", icon: Home },
  { href: "/groups", label: "分组倍率", icon: Layers3 },
  { href: "/sources", label: "倍率采集", icon: Database },
  { href: "/accounts", label: "账号调度", icon: UsersRound },
  { href: "/logs", label: "系统日志", icon: ScrollText },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#main-content" className="fixed left-4 top-4 z-40 -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0">跳到主要内容</a>
      <TopNavigation pathname={pathname} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6 xl:px-10">{children}</main>
    </div>
  );
}

function TopNavigation({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="hidden min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center lg:grid">
            <div className="justify-self-start"><Brand /></div>
            <nav aria-label="主导航" className="flex items-center gap-1 justify-self-center"><Navigation pathname={pathname} /></nav>
            <div className="justify-self-end"><HeaderActions /></div>
          </div>
          <div className="lg:hidden">
            <div className="flex min-h-14 items-center justify-between gap-3"><Brand /><HeaderActions compact /></div>
            <nav aria-label="移动端主导航" className="-mx-4 flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5"><Navigation pathname={pathname} mobile /></nav>
          </div>
      </div>
    </header>
  );
}

function Navigation({ pathname, mobile = false }: Readonly<{ pathname: string; mobile?: boolean }>) {
  return navigation.map((item) => {
    const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm transition-colors duration-200 ${mobile ? "min-w-fit" : ""} ${active ? "bg-primary/15 font-semibold text-primary-strong" : "font-medium text-muted hover:bg-surface-muted hover:text-foreground"}`}>
        <Icon className="size-3.5" aria-hidden="true" />{item.label}
      </Link>
    );
  });
}

function Brand() {
  return (
    <Link href="/" aria-label="S2A Rate Bot 首页" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold text-foreground transition-opacity hover:opacity-80">
      <span className="inline-flex h-8 items-center rounded-md bg-primary px-2 text-sm font-bold text-primary-foreground">S2A</span>
      <span>Rate Bot</span>
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
  return <span className={`hidden min-h-8 items-center gap-2 rounded-md border px-3 text-xs xl:inline-flex ${connected ? "border-success/25 bg-success/10 text-success" : "border-border bg-surface-muted text-muted"}`}><CircleDot className="size-3.5" aria-hidden="true" />{connected ? "Worker 已连接" : "Worker 未连接"}</span>;
}
