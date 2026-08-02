"use client";

import { Plus, Trash2, Trophy } from "lucide-react";
import type { LotteryPrize } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { LotteryFormSection } from "./lottery-form-section";
import { PRIZE_TYPE_OPTIONS, emptyLotteryPrize, type LotteryFormDraft } from "./lottery-form-model";

const MIN_PRIZE_VALUE = 0.01;
const MAX_PROBABILITY = 100;

export function LotteryPrizeFields(props: Readonly<{
  drawMode: LotteryFormDraft["drawMode"];
  prizes: readonly LotteryPrize[];
  onChange: (prizes: LotteryPrize[]) => void;
}>) {
  return <LotteryFormSection id="lottery-prizes-heading" icon={Trophy} title="奖品设置" description="设置奖品额度、数量和即时开奖的中奖率。"
    action={<Button type="button" variant="secondary" onClick={() => props.onChange([...props.prizes, emptyLotteryPrize()])}><Plus className="size-4" />添加奖品</Button>}>
    {props.drawMode === "instant" ? <ProbabilitySummary prizes={props.prizes} /> : null}
    <div className="mt-4 space-y-3">
      {props.prizes.map((prize, index) => <PrizeRow key={prize.id || index} prize={prize} index={index} drawMode={props.drawMode}
        removable={props.prizes.length > 1}
        onChange={(next) => props.onChange(props.prizes.map((item, itemIndex) => itemIndex === index ? next : item))}
        onRemove={() => props.onChange(props.prizes.filter((_, itemIndex) => itemIndex !== index))} />)}
    </div>
  </LotteryFormSection>;
}

function ProbabilitySummary({ prizes }: Readonly<{ prizes: readonly LotteryPrize[] }>) {
  const total = prizes.reduce((sum, prize) => sum + (prize.probability ?? 0), 0);
  const remaining = Math.max(0, MAX_PROBABILITY - total);
  const invalid = total > MAX_PROBABILITY;
  return <div role="status" aria-live="polite" className={`rounded-lg border px-3 py-3 ${invalid ? "border-danger/25 bg-danger/10 text-danger" : "border-primary/20 bg-primary/5"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>中奖率合计 <strong className="tabular-nums">{total.toFixed(2)}%</strong></span><span className="text-muted">未中奖 <strong className="tabular-nums text-foreground">{remaining.toFixed(2)}%</strong></span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true"><span className={`block h-full rounded-full transition-[width] duration-200 ${invalid ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(MAX_PROBABILITY, Math.max(0, total))}%` }} /></div>
    {invalid ? <p className="mt-2 text-xs">请将中奖率合计调整到 100% 以内。</p> : null}
  </div>;
}

function PrizeRow(props: Readonly<{
  prize: LotteryPrize;
  index: number;
  drawMode: LotteryFormDraft["drawMode"];
  removable: boolean;
  onChange: (prize: LotteryPrize) => void;
  onRemove: () => void;
}>) {
  const fieldPrefix = `lottery-prize-${props.index}`;
  return <article aria-labelledby={`${fieldPrefix}-heading`} className="rounded-lg border border-border bg-surface-muted/35 p-3 sm:p-4">
    <header className="mb-3 flex items-center justify-between gap-3"><div><p id={`${fieldPrefix}-heading`} className="text-sm font-semibold">奖品 {props.index + 1}</p><p className="mt-0.5 text-xs text-muted">中奖后自动发放对应类型的兑换码</p></div>
      <Button type="button" variant="ghost" size="icon-sm" disabled={!props.removable} aria-label={props.removable ? `删除奖品 ${props.index + 1}` : "至少保留一个奖品"} title={props.removable ? "删除奖品" : "至少保留一个奖品"} onClick={props.onRemove}><Trash2 className="size-4" /></Button>
    </header>
    <div className={`grid gap-3 ${props.drawMode === "instant" ? "lg:grid-cols-[minmax(180px,1.6fr)_140px_130px_100px_120px]" : "lg:grid-cols-[minmax(180px,1.8fr)_160px_140px_100px]"}`}>
      <PrizeField id={`${fieldPrefix}-name`} label="奖品名称" required><Input id={`${fieldPrefix}-name`} required value={props.prize.name} placeholder="例如：余额 10 元" onChange={(event) => props.onChange({ ...props.prize, name: event.target.value })} /></PrizeField>
      <PrizeField label="奖励类型"><Select ariaLabel={`奖品 ${props.index + 1} 奖励类型`} value={props.prize.type} options={PRIZE_TYPE_OPTIONS} onValueChange={(value) => props.onChange({ ...props.prize, type: value as LotteryPrize["type"] })} /></PrizeField>
      <PrizeField id={`${fieldPrefix}-value`} label="奖励额度" required><Input id={`${fieldPrefix}-value`} type="number" inputMode="decimal" required min={MIN_PRIZE_VALUE} step="any" value={props.prize.value} onChange={(event) => props.onChange({ ...props.prize, value: Number(event.target.value) })} /></PrizeField>
      <PrizeField id={`${fieldPrefix}-quantity`} label="奖品份数" required><Input id={`${fieldPrefix}-quantity`} type="number" inputMode="numeric" required min={1} max={100} value={props.prize.quantity} onChange={(event) => props.onChange({ ...props.prize, quantity: Number(event.target.value) })} /></PrizeField>
      {props.drawMode === "instant" ? <PrizeField id={`${fieldPrefix}-probability`} label="中奖率" required><Input id={`${fieldPrefix}-probability`} type="number" inputMode="decimal" required min={0.01} max={MAX_PROBABILITY} step={0.01} value={props.prize.probability ?? ""} onChange={(event) => props.onChange({ ...props.prize, probability: Number(event.target.value) })} /></PrizeField> : null}
    </div>
  </article>;
}

function PrizeField(props: Readonly<{ id?: string; label: string; required?: boolean; children: React.ReactNode }>) {
  return <Label htmlFor={props.id} className="block space-y-1.5 text-sm font-medium"><span>{props.label}{props.required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span>{props.children}</Label>;
}
