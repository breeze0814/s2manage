const TONES = {
  neutral: "border-border bg-surface-muted text-muted",
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  primary: "border-primary/30 bg-primary/15 text-primary-strong",
  rate: "border-rate/30 bg-rate/10 text-rate",
} as const;

export type TagTone = keyof typeof TONES;

export function Tag({ children, tone = "neutral", className = "", title }: Readonly<{
  children: React.ReactNode;
  tone?: TagTone;
  className?: string;
  title?: string;
}>) {
  return <span title={title} className={`inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-5 ${TONES[tone]} ${className}`}>{children}</span>;
}
