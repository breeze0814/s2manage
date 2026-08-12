import { Calculator, Gift, MessageSquareText, Trophy, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmbedSettingsDialog } from "./embed-settings-dialog";
import { EngagementNavigation } from "./engagement-navigation";

type Kind = "tickets" | "leaderboard" | "lottery" | "compensation";
const ICONS: Record<Kind, LucideIcon> = {
  tickets: MessageSquareText,
  leaderboard: Trophy,
  lottery: Gift,
  compensation: Calculator,
};

export function EngagementPageHeader(props: Readonly<{
  kind: Kind;
  title: string;
  description: string;
  actions?: ReactNode;
}>) {
  const Icon = ICONS[props.kind];
  return (
    <header className="border-b border-border">
      <div className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-primary/20 bg-primary/10 text-primary-strong"><Icon className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="text-xs font-semibold text-primary-strong">互动运营</p><h1 className="mt-0.5 text-xl font-semibold leading-7 sm:text-2xl sm:leading-8">{props.title}</h1><p className="mt-0.5 max-w-3xl text-sm leading-5 text-muted">{props.description}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0"><EmbedSettingsDialog kind={props.kind} compact />{props.actions}</div>
      </div>
      <div className="-mb-px"><EngagementNavigation /></div>
    </header>
  );
}
