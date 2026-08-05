"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Gift, MessageSquareText, Trophy } from "lucide-react";

const ITEMS = [
  { href: "/tickets", label: "工单", icon: MessageSquareText },
  { href: "/lottery", label: "抽奖", icon: Gift },
  { href: "/compensation", label: "订单补偿", icon: Calculator },
  { href: "/leaderboard", label: "排行榜", icon: Trophy },
] as const;

export function EngagementNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="互动运营导航" className="flex gap-5 overflow-x-auto">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors duration-200 ${active ? "border-primary font-semibold text-primary-strong" : "border-transparent text-muted hover:border-border-strong hover:text-foreground"}`}>
            <Icon className="size-4" aria-hidden="true" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
