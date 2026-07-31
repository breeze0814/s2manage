"use client";

import { CircleDot, Database, Home, Layers3, PanelsTopLeft, ScrollText, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SettingsDialog } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

const NAVIGATION = [
  { href: "/", label: "概览", icon: Home },
  { href: "/groups", label: "分组倍率", icon: Layers3 },
  { href: "/sources", label: "倍率采集", icon: Database },
  { href: "/accounts", label: "账号调度", icon: UsersRound },
  { href: "/tickets", label: "互动运营", icon: PanelsTopLeft, matches: ["/tickets", "/leaderboard", "/lottery"] },
  { href: "/logs", label: "系统日志", icon: ScrollText },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SkipLink />
      <TopNavigation pathname={pathname} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1720px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
        {children}
      </main>
    </div>
  );
}

function SkipLink() {
  return <a href="#main-content" className="fixed left-4 top-4 z-[60] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md focus:translate-y-0">跳到主要内容</a>;
}

function TopNavigation({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1720px] px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="hidden min-h-16 items-center gap-5 lg:flex">
          <Brand />
          <nav aria-label="主导航" className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto">
            <Navigation pathname={pathname} />
          </nav>
          <HeaderActions showWorker />
        </div>
        <div className="lg:hidden">
          <div className="flex min-h-14 items-center justify-between gap-3"><Brand /><HeaderActions /></div>
          <nav aria-label="移动端主导航" className="-mx-4 flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 sm:-mx-6 sm:px-6">
            <Navigation pathname={pathname} mobile />
          </nav>
        </div>
      </div>
    </header>
  );
}

function Navigation({ pathname, mobile = false }: Readonly<{ pathname: string; mobile?: boolean }>) {
  return NAVIGATION.map((item) => {
    const active = isActive(pathname, item);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={`top-nav-link ${mobile ? "shrink-0" : ""} ${active ? "top-nav-link-active" : ""}`}>
        <Icon className="size-4" aria-hidden="true" />{item.label}
      </Link>
    );
  });
}

function Brand() {
  return (
    <Link href="/" aria-label="S2A Rate Bot 首页" className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-md font-semibold text-foreground transition-opacity hover:opacity-80">
      <span className="inline-flex h-8 items-center rounded-md bg-primary px-2 text-sm font-bold text-primary-foreground">S2A</span>
      <span className="hidden text-sm xl:inline">Rate Bot</span>
    </Link>
  );
}

function HeaderActions({ showWorker = false }: Readonly<{ showWorker?: boolean }>) {
  return <div className="flex shrink-0 items-center gap-2">{showWorker ? <WorkerBadge /> : null}<SettingsDialog /><ThemeToggle /></div>;
}

function WorkerBadge() {
  const connected = useWorkerConnection();
  const label = connected ? "Worker 已连接" : "Worker 未连接";
  return (
    <span title={label} aria-label={label} className={`hidden min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium xl:inline-flex ${workerTone(connected)}`}>
      <CircleDot className="size-3" aria-hidden="true" />{connected ? "Worker 已连" : "Worker 未连"}
    </span>
  );
}

function useWorkerConnection() {
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
  return connected;
}

function isActive(pathname: string, item: NavigationItem) {
  const paths = item.matches ?? [item.href];
  return paths.some((path) => path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`));
}

function workerTone(connected: boolean) {
  return connected ? "border-success/25 bg-success/10 text-success" : "border-border bg-surface-muted text-muted";
}

type NavigationItem = Readonly<{ href: string; label: string; icon: LucideIcon; matches?: readonly string[] }>;
