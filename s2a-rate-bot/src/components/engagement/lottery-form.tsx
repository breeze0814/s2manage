"use client";

import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { LotteryCampaign, LotteryPrize } from "../../server/embeds/types";
import { campaignInputError } from "../../server/embeds/lottery-validation";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { requestJson } from "./api";

type Draft = {
  name: string; description: string; drawMode: "instant" | "scheduled";
  registrationStart: string; registrationEnd: string; drawAt: string;
  publicWinners: boolean; prizes: LotteryPrize[];
};
const DEFAULT_PRIZE_VALUE = 10;
const DEFAULT_PROBABILITY = 10;
const MIN_PRIZE_VALUE = 0.01;
const PRIZE_TYPE_OPTIONS = [{ value: "balance", label: "余额" }, { value: "subscription", label: "订阅" }] as const;

export function LotteryForm({ campaign, onSaved, onCancel }: Readonly<{
  campaign: LotteryCampaign | null; onSaved: (campaign: LotteryCampaign) => void; onCancel: () => void;
}>) {
  const [draft, setDraft] = useState(() => initialDraft(campaign));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => { setDraft(initialDraft(campaign)); setFormError(""); }, [campaign]);
  const save = () => void saveCampaign({ draft, campaign, setSaving, setFormError, onSaved });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
        <DialogContent className="flex max-h-[92dvh] w-[min(96vw,920px)] flex-col overflow-hidden">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div><DialogTitle className="font-semibold">{campaign ? "编辑抽奖活动" : "新建抽奖活动"}</DialogTitle><DialogDescription className="mt-1 text-sm leading-5 text-muted">设置开奖模式和限量奖池，中奖时自动生成目标站兑换码。</DialogDescription></div>
            <DialogClose asChild><Button type="button" variant="secondary" size="icon-sm" aria-label="关闭活动表单" title="关闭"><X className="size-4" /></Button></DialogClose>
          </header>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); save(); }}>
            <div className="grid gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2">
        <Field label="活动名称"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <DrawModeField value={draft.drawMode} onChange={(drawMode) => setDraft(changeDrawMode(draft, drawMode))} />
        <Field label="活动说明" wide><Textarea className="min-h-24 resize-y" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <DateField label="活动开始" value={draft.registrationStart} onChange={(value) => setDraft({ ...draft, registrationStart: value })} />
        <DateField label="活动结束" value={draft.registrationEnd} onChange={(value) => setDraft({ ...draft, registrationEnd: value })} />
        {draft.drawMode === "scheduled" ? <DateField label="开奖时间" value={draft.drawAt} required onChange={(value) => setDraft({ ...draft, drawAt: value })} /> : null}
        <Label htmlFor="lottery-public-winners" className="flex min-h-11 items-center gap-3 self-end rounded-lg border border-border px-3"><Checkbox id="lottery-public-winners" checked={draft.publicWinners} onCheckedChange={(checked) => setDraft({ ...draft, publicWinners: checked === true })} /><span><span className="block">公开中奖名单</span><span className="text-xs font-normal text-muted">仅展示脱敏邮箱，不公开兑换码</span></span></Label>
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">奖品</h3><Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, prizes: [...draft.prizes, emptyPrize()] })}><Plus className="size-4" />添加奖品</Button></div>
          {draft.drawMode === "instant" ? <ProbabilitySummary prizes={draft.prizes} /> : null}
          {draft.prizes.map((prize, index) => <PrizeRow key={prize.id || index} prize={prize} index={index} drawMode={draft.drawMode} removable={draft.prizes.length > 1}
            onChange={(next) => setDraft({ ...draft, prizes: draft.prizes.map((item, itemIndex) => itemIndex === index ? next : item) })}
            onRemove={() => setDraft({ ...draft, prizes: draft.prizes.filter((_, itemIndex) => itemIndex !== index) })} />)}
        </div>
              {formError ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger lg:col-span-2">{formError}</p> : null}
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
              <DialogClose asChild><Button type="button" variant="secondary">取消</Button></DialogClose>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存活动</Button>
            </footer>
          </form>
        </DialogContent>
    </Dialog>
  );
}

function PrizeRow({ prize, index, drawMode, removable, onChange, onRemove }: Readonly<{ prize: LotteryPrize; index: number; drawMode: Draft["drawMode"]; removable: boolean; onChange: (prize: LotteryPrize) => void; onRemove: () => void }>) {
  return <div className="grid gap-2 rounded-lg border border-border bg-surface-muted p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_140px_120px_92px_100px_44px]">
    <Label><span className="mb-1 block text-xs text-muted">奖品 {index + 1}</span><Input value={prize.name} onChange={(event) => onChange({ ...prize, name: event.target.value })} /></Label>
    <Label><span className="mb-1 block text-xs text-muted">奖励类型</span><Select ariaLabel={`奖品 ${index + 1} 奖励类型`} value={prize.type} options={PRIZE_TYPE_OPTIONS} onValueChange={(value) => onChange({ ...prize, type: value as LotteryPrize["type"] })} /></Label>
    <Label><span className="mb-1 block text-xs text-muted">{prize.type === "balance" ? "余额金额（奖励额度）" : "订阅额度（奖励额度）"}</span><Input type="number" min={MIN_PRIZE_VALUE} step="any" value={prize.value} onChange={(event) => onChange({ ...prize, value: Number(event.target.value) })} /></Label>
    <Label><span className="mb-1 block text-xs text-muted">奖品份数</span><Input type="number" min={1} max={100} value={prize.quantity} onChange={(event) => onChange({ ...prize, quantity: Number(event.target.value) })} /></Label>
    {drawMode === "instant" ? <Label><span className="mb-1 block text-xs text-muted">中奖率（%）</span><Input type="number" min={0.01} max={100} step={0.01} value={prize.probability ?? ""} onChange={(event) => onChange({ ...prize, probability: Number(event.target.value) })} /></Label> : <span />}
    <Button type="button" variant="secondary" size="icon" className="self-end" disabled={!removable} aria-label={`删除奖品 ${index + 1}`} title="删除奖品" onClick={onRemove}><Trash2 className="size-4" /></Button>
  </div>;
}

function DrawModeField({ value, onChange }: Readonly<{ value: Draft["drawMode"]; onChange: (value: Draft["drawMode"]) => void }>) {
  return <fieldset className="lg:col-span-2"><legend className="mb-1.5 text-sm font-medium">开奖方式</legend>
    <RadioGroup value={value} onValueChange={(next) => onChange(next as Draft["drawMode"])} className="grid gap-3 sm:grid-cols-2">
      <DrawModeOption value="instant" title="即时开奖" description="按每个奖品的独立中奖率立即返回结果，剩余概率为未中奖。" />
      <DrawModeOption value="scheduled" title="定时开奖" description="用户先报名，到达开奖时间后统一随机分配奖品。" />
    </RadioGroup>
  </fieldset>;
}

function DrawModeOption({ value, title, description }: Readonly<{ value: Draft["drawMode"]; title: string; description: string }>) {
  return <Label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
    <RadioGroupItem value={value} aria-label={title} className="mt-0.5" />
    <span><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted">{description}</span></span>
  </Label>;
}

function Field({ label, wide = false, children }: Readonly<{ label: string; wide?: boolean; children: React.ReactNode }>) { return <Label className={wide ? "block lg:col-span-2" : "block"}><span className="mb-1.5 block">{label}</span>{children}</Label>; }
function DateField({ label, value, required = false, onChange }: Readonly<{ label: string; value: string; required?: boolean; onChange: (value: string) => void }>) { return <Field label={`${label}${required ? " *" : ""}`}><Input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} /></Field>; }

async function saveCampaign(input: Readonly<{ draft: Draft; campaign: LotteryCampaign | null; setSaving: (value: boolean) => void; setFormError: (value: string) => void; onSaved: (campaign: LotteryCampaign) => void }>) {
  const body = requestBody(input.draft);
  const validationError = campaignInputError(body);
  input.setFormError(validationError ?? "");
  if (validationError) return;
  input.setSaving(true);
  try {
    const path = input.campaign ? `/api/lottery/campaigns/${input.campaign.id}` : "/api/lottery/campaigns";
    const campaign = await requestJson<LotteryCampaign>(path, { method: input.campaign ? "PATCH" : "POST", body: JSON.stringify(body) });
    input.onSaved(campaign); toast.success(input.campaign ? "活动已更新" : "活动已创建");
  } catch (error) { const value = error instanceof Error ? error.message : String(error); input.setFormError(value); toast.error(value); }
  finally { input.setSaving(false); }
}

function requestBody(draft: Draft) { return { ...draft, registrationStart: toIso(draft.registrationStart), registrationEnd: toIso(draft.registrationEnd), drawAt: draft.drawMode === "scheduled" ? toIso(draft.drawAt) : null }; }
function initialDraft(campaign: LotteryCampaign | null): Draft { return campaign ? { ...campaign, registrationStart: toInput(campaign.registrationStart), registrationEnd: toInput(campaign.registrationEnd), drawAt: toInput(campaign.drawAt), prizes: [...campaign.prizes] } : { name: "", description: "", drawMode: "instant", registrationStart: "", registrationEnd: "", drawAt: "", publicWinners: true, prizes: [emptyPrize()] }; }
function emptyPrize(): LotteryPrize { return { id: crypto.randomUUID(), name: "", type: "balance", value: DEFAULT_PRIZE_VALUE, quantity: 1, probability: DEFAULT_PROBABILITY }; }
function changeDrawMode(draft: Draft, drawMode: Draft["drawMode"]): Draft { return { ...draft, drawMode, drawAt: drawMode === "instant" ? "" : draft.drawAt, prizes: draft.prizes.map((prize) => ({ ...prize, probability: drawMode === "instant" ? prize.probability ?? DEFAULT_PROBABILITY : null })) }; }
function ProbabilitySummary({ prizes }: Readonly<{ prizes: readonly LotteryPrize[] }>) { const total = prizes.reduce((sum, prize) => sum + (prize.probability ?? 0), 0); const invalid = total > 100; return <div className={`flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${invalid ? "border-danger/25 bg-danger/10 text-danger" : "border-primary/20 bg-primary/5"}`}><span>奖品概率合计 <strong>{total.toFixed(2)}%</strong></span><span>未中奖概率 <strong>{Math.max(0, 100 - total).toFixed(2)}%</strong></span></div>; }
function toIso(value: string) { return value ? new Date(value).toISOString() : null; }
function toInput(value: string | null) { if (!value) return ""; const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); }
