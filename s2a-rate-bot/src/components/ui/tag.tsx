const TONES = {
  neutral: "border-border bg-surface-muted text-muted",
  info: "border-info/20 bg-info/10 text-info",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-danger/20 bg-danger/10 text-danger",
  primary: "border-primary/25 bg-primary/[0.12] text-primary-strong",
  rate: "border-rate/25 bg-rate/10 text-rate",
} as const;

export type TagTone = keyof typeof TONES;

export function Tag({ children, tone = "neutral", className = "", title }: Readonly<{
  children: React.ReactNode;
  tone?: TagTone;
  className?: string;
  title?: string;
}>) {
  return (
    <span
      title={title}
      className={`inline-flex h-6 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 text-xs font-medium leading-none ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
