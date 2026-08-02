import type { LucideIcon } from "lucide-react";

export function LotteryFormSection(props: Readonly<{
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const Icon = props.icon;
  return <section aria-labelledby={props.id} className="border-b border-border px-4 py-5 last:border-b-0 sm:px-6 sm:py-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Icon className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0"><h3 id={props.id} className="text-base font-semibold">{props.title}</h3><p className="mt-1 text-xs leading-5 text-muted">{props.description}</p></div>
      </div>
      {props.action}
    </div>
    <div className="mt-5">{props.children}</div>
  </section>;
}
