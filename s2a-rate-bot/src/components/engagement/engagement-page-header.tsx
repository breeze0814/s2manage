import { Gift, MessageSquareText, Trophy, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmbedSettingsDialog } from "./embed-settings-dialog";
import { EngagementNavigation } from "./engagement-navigation";

type Kind = "tickets" | "leaderboard" | "lottery";
const ICONS: Record<Kind, LucideIcon> = { tickets: MessageSquareText, leaderboard: Trophy, lottery: Gift };

export function EngagementPageHeader(props: Readonly<{
  kind: Kind;
  title: string;
  description: string;
  actions?: ReactNode;
}>) {
  const Icon = ICONS[props.kind];
  return (
    <header className="border-b border-border">
      <div className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary-strong"><Icon className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="text-xs font-semibold text-primary-strong">互动运营</p><h1 className="mt-1 text-2xl font-semibold leading-8">{props.title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{props.description}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0"><EmbedSettingsDialog kind={props.kind} />{props.actions}</div>
      </div>
      <div className="-mb-px"><EngagementNavigation /></div>
    </header>
  );
}
