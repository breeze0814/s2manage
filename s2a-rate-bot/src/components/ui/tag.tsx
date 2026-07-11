const TONES = {
  neutral: "border-border bg-surface-muted text-muted",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  primary: "border-primary/35 bg-primary/10 text-foreground",
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
