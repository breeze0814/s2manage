"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, MessageSquareText, Trophy } from "lucide-react";

const ITEMS = [
  { href: "/tickets", label: "工单", icon: MessageSquareText },
  { href: "/lottery", label: "抽奖", icon: Gift },
  { href: "/leaderboard", label: "排行榜", icon: Trophy },
] as const;

export function EngagementNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="互动运营导航" className="flex gap-1 overflow-x-auto">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 min-w-24 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-200 ${active ? "bg-surface font-semibold text-primary-strong shadow-sm" : "text-muted hover:bg-surface hover:text-foreground"}`}>
            <Icon className="size-4" aria-hidden="true" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
