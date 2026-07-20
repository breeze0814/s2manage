import * as Switch from "@radix-ui/react-switch";
import { CompactNumberInput } from "../ui/compact-number-input";
import { Select } from "../ui/select";
import type { RuleDraft, RuleType } from "./types";

export function StepHeading({ step, title, description }: Readonly<{
  step: string;
  title: string;
  description: string;
}>) {
  return <div className="flex items-start gap-3">
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{step}</span>
    <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-0.5 text-xs text-muted">{description}</p></div>
  </div>;
}

export function EnabledField({ name, enabled, onChange }: Readonly<{
  name: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}>) {
  return <div className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-surface-muted/40 px-3">
    <div><p className="text-sm font-medium">启用倍率规则</p><p className="text-xs text-muted">关闭后将无法预览或应用此规则。</p></div>
    <Switch.Root aria-label={`${name}规则启用状态`} checked={enabled} onCheckedChange={onChange}
      className="h-6 w-11 rounded-full bg-border-strong p-0.5 data-[state=checked]:bg-primary">
      <Switch.Thumb className="block size-5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-5" />
    </Switch.Root>
  </div>;
}

export function RuleFields({ draft, update }: Readonly<{ draft: RuleDraft; update: UpdateDraft }>) {
  return <fieldset>
    <legend className="text-sm font-semibold">计算规则</legend>
    <div className="mt-3 grid items-start gap-4 sm:grid-cols-3">
      <div><Field label="规则类型"><Select ariaLabel="规则类型" value={draft.ruleType}
        options={RULE_TYPE_OPTIONS} onValueChange={(value) => update("ruleType", value as RuleType)} /></Field></div>
      <Field label="偏移"><CompactNumberInput required step="any" tone="rate" value={draft.offset}
        onChange={(value) => update("offset", value)} /></Field>
      <Field label="计算最小值" hint="计算结果低于该固定值时，直接使用此值。">
        <CompactNumberInput required min="0" step="any" width="medium" tone="rate" value={draft.minimum}
          onChange={(value) => update("minimum", value)} />
      </Field>
      {draft.ruleType === "avg_formula" ? <div className="sm:col-span-3"><Field label="自定义公式">
        <input value={draft.formula} onChange={(event) => update("formula", event.target.value)} className="form-control" />
      </Field></div> : null}
    </div>
  </fieldset>;
}

function Field({ label, hint, children }: Readonly<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}>) {
  return <label className="block space-y-2 text-sm font-medium">
    <span>{label}</span>{children}
    {hint ? <span className="block text-xs font-normal leading-5 text-muted">{hint}</span> : null}
  </label>;
}

type UpdateDraft = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
const RULE_TYPE_OPTIONS = [
  { value: "first", label: "首个倍率" },
  { value: "average", label: "平均值" },
  { value: "min", label: "最小值" },
  { value: "max", label: "最大值" },
  { value: "avg_formula", label: "自定义公式" },
] as const;
