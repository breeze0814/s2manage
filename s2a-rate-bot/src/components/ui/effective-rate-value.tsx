export function EffectiveRateValue({ children, className = "" }: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums text-effective-rate ${className}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-effective-rate" />
      {children}
    </span>
  );
}
