import { Calculator } from "lucide-react";
import { toast } from "sonner";
import { evaluateRateRule } from "../../core/rate-rule";
import { Button } from "../ui/button";
import type { RuleDraft, SourceBinding, SourceRateOption } from "./types";

export type PreviewState = { readonly rate: number | null };

export function PreviewRate({ draft, rates, currentRate, preview, setPreview }: Readonly<{
  draft: RuleDraft;
  rates: readonly SourceRateOption[];
  currentRate?: number | null;
  preview: PreviewState;
  setPreview: (value: PreviewState) => void;
}>) {
  const calculate = () => {
    try {
      setPreview({ rate: calculatePreview(draft, rates, currentRate) });
    } catch (error) {
      setPreview({ rate: null });
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/40 p-3">
    <div><p className="text-sm font-medium">预览倍率</p><p className="mt-1 text-xs text-muted">
      {preview.rate === null ? "使用当前草稿计算，不会保存或应用。" : <>计算结果：<strong className="font-mono text-rate">×{preview.rate}</strong></>}
    </p></div>
    <Button type="button" variant="secondary" onClick={calculate} disabled={!draft.enabled || draft.bindings.length === 0} className="w-full">
      <Calculator className="size-4" />预览倍率
    </Button>
  </div>;
}

function calculatePreview(draft: RuleDraft, rates: readonly SourceRateOption[], currentRate?: number | null) {
  const index = new Map(rates.map((rate) => [rateKey(rate), rate.effectiveRate]));
  const sourceRates = draft.bindings
    .map((binding) => index.get(bindingKey(binding)))
    .filter((rate): rate is number => rate !== undefined);
  if (sourceRates.length !== draft.bindings.length) {
    throw new Error("部分已绑定分组不属于当前平台或已不存在");
  }
  return evaluateRateRule({
    rule: {
      enabled: draft.enabled,
      mode: draft.ruleType,
      adjustmentMode: draft.adjustmentMode,
      adjustmentValue: draftNumber(draft.adjustmentValue, "倍率调整值"),
      minimum: draftNumber(draft.minimum, "计算最小值"),
      formula: draft.formula,
    },
    sourceRates,
    currentRate: currentRate ?? null,
  });
}

function draftNumber(value: string, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${label}必须是有效数字`);
  return number;
}

function rateKey(rate: SourceRateOption) { return `${rate.sourceSiteId}:${rate.groupId}`; }
function bindingKey(binding: SourceBinding) { return `${binding.sourceSiteId}:${binding.sourceGroupId}`; }
