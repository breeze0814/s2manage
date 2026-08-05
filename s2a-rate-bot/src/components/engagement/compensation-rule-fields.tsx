import { Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { CompensationRuleDraft } from "./compensation-config-model";
import { newRule } from "./compensation-config-model";

export function CompensationRuleFields(props: Readonly<{
  rules: readonly CompensationRuleDraft[];
  onChange: (rules: readonly CompensationRuleDraft[]) => void;
}>) {
  const update = (index: number, patch: Partial<CompensationRuleDraft>) => {
    props.onChange(props.rules.map((rule, itemIndex) => itemIndex === index ? { ...rule, ...patch } : rule));
  };
  return (
    <fieldset className="border-t border-border pt-5 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div><legend className="font-semibold">补偿规则</legend><p className="mt-1 text-sm text-muted">订单创建时间按配置区间匹配，区间结束时间不包含在内。</p></div>
        <Button type="button" variant="secondary" onClick={() => props.onChange([...props.rules, newRule()])}>
          <Plus className="size-4" />添加规则
        </Button>
      </div>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {props.rules.map((rule, index) => (
          <div key={rule.id} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1.4fr_120px_44px] xl:items-end">
            <Field id={`rule-name-${rule.id}`} label="档位名称">
              <Input id={`rule-name-${rule.id}`} required value={rule.name} onChange={(event) => update(index, { name: event.target.value })} />
            </Field>
            <Field id={`rule-start-${rule.id}`} label="开始时间">
              <Input id={`rule-start-${rule.id}`} type="datetime-local" required value={rule.startAt} onChange={(event) => update(index, { startAt: event.target.value })} />
            </Field>
            <Field id={`rule-end-${rule.id}`} label="结束时间">
              <Input id={`rule-end-${rule.id}`} type="datetime-local" required value={rule.endAt} onChange={(event) => update(index, { endAt: event.target.value })} />
            </Field>
            <Field id={`rule-rate-${rule.id}`} label="补偿比例 %">
              <Input id={`rule-rate-${rule.id}`} type="number" min={1} max={100} step={1} required value={rule.ratePercent}
                onChange={(event) => update(index, { ratePercent: Number(event.target.value) })} />
            </Field>
            <Button type="button" variant="ghost" size="icon" className="text-danger hover:bg-danger/10 hover:text-danger"
              disabled={props.rules.length === 1} aria-label={`删除规则 ${rule.name || index + 1}`} title="删除规则"
              onClick={() => props.onChange(props.rules.filter((_, itemIndex) => itemIndex !== index))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function Field(props: Readonly<{ id: string; label: string; children: React.ReactNode }>) {
  return <Label htmlFor={props.id} className="block"><span className="mb-1.5 block">{props.label}</span>{props.children}</Label>;
}
