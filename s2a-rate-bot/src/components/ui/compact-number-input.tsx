const WIDTHS = {
  narrow: "sm:w-[7ch]",
  compact: "sm:w-[9ch]",
  medium: "sm:w-[11ch]",
} as const;

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "onChange" | "value"> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly suffix?: string;
  readonly width?: keyof typeof WIDTHS;
  readonly tone?: "default" | "rate";
};

export function CompactNumberInput({ value, onChange, suffix, width = "compact", tone = "default", ...input }: Readonly<NumberInputProps>) {
  const valueColor = tone === "rate" ? "text-rate" : "text-foreground";
  return (
    <span className="flex min-h-11 w-full overflow-hidden rounded-lg border border-border-strong bg-surface transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:w-fit">
      <input {...input} type="number" value={value} onChange={(event) => onChange(event.target.value)} className={`min-w-0 flex-1 bg-transparent px-3 text-base font-mono tabular-nums outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted sm:text-sm ${valueColor} ${WIDTHS[width]}`} />
      {suffix ? <span aria-hidden="true" className="flex shrink-0 items-center border-l border-border bg-surface-muted/60 px-2.5 text-xs text-muted">{suffix}</span> : null}
    </span>
  );
}
