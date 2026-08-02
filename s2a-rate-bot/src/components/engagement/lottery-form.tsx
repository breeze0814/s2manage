"use client";

import { AlertTriangle, Gift, Loader2, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LotteryCampaign } from "../../server/embeds/types";
import { campaignInputError } from "../../server/embeds/lottery-validation";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { requestJson } from "./api";
import { initialLotteryDraft, lotteryRequestBody, type LotteryFormDraft } from "./lottery-form-model";
import { LotteryActivityFields, LotteryParticipationFields } from "./lottery-form-sections";
import { LotteryPrizeFields } from "./lottery-prize-fields";

export function LotteryForm(props: Readonly<{
  campaign: LotteryCampaign | null;
  onSaved: (campaign: LotteryCampaign) => void;
  onCancel: () => void;
}>) {
  const [draft, setDraft] = useState(() => initialLotteryDraft(props.campaign));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(initialLotteryDraft(props.campaign)); setFormError(""); }, [props.campaign]);
  useEffect(() => { if (formError) errorRef.current?.focus(); }, [formError]);
  const changeDraft = (value: LotteryFormDraft) => { setDraft(value); setFormError(""); };
  const save = () => void saveCampaign({ draft, campaign: props.campaign, setSaving, setFormError, onSaved: props.onSaved });
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) props.onCancel(); }}>
    <DialogContent aria-labelledby="lottery-dialog-title" aria-describedby="lottery-dialog-description" className="flex h-[calc(100dvh-1rem)] max-h-[900px] w-[calc(100vw-1rem)] flex-col overflow-hidden sm:h-[min(840px,92dvh)] sm:w-[min(96vw,1040px)]">
      <LotteryDialogHeader editing={Boolean(props.campaign)} saving={saving} />
      <form className="flex min-h-0 flex-1 flex-col" aria-busy={saving} aria-describedby={formError ? "lottery-form-error" : undefined} onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/40">
          {formError ? <div ref={errorRef} id="lottery-form-error" role="alert" aria-live="assertive" tabIndex={-1} className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger sm:mx-6">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="break-words">{formError}</span>
          </div> : null}
          <LotteryActivityFields value={draft} onChange={changeDraft} />
          <LotteryParticipationFields value={draft} onChange={changeDraft} />
          <LotteryPrizeFields drawMode={draft.drawMode} prizes={draft.prizes} onChange={(prizes) => changeDraft({ ...draft, prizes })} />
        </div>
        <LotteryFormActions draft={draft} saving={saving} />
      </form>
    </DialogContent>
  </Dialog>;
}

function LotteryDialogHeader({ editing, saving }: Readonly<{ editing: boolean; saving: boolean }>) {
  return <header className="relative shrink-0 border-b border-border bg-surface-muted/30 px-4 py-4 pr-16 sm:px-6 sm:py-5">
    <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Gift className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0"><DialogTitle id="lottery-dialog-title" className="text-lg font-semibold">{editing ? "编辑抽奖活动" : "新建抽奖活动"}</DialogTitle><DialogDescription id="lottery-dialog-description" className="mt-1 text-sm leading-6 text-muted">配置活动、参与规则和奖品，中奖后自动生成目标站兑换码。</DialogDescription></div>
    </div>
    <DialogClose asChild><Button type="button" variant="ghost" size="icon" disabled={saving} aria-label="关闭活动表单" title="关闭" className="absolute right-3 top-3 text-muted"><X className="size-4" /></Button></DialogClose>
  </header>;
}

function LotteryFormActions(props: Readonly<{
  draft: LotteryFormDraft;
  saving: boolean;
}>) {
  const inventory = props.draft.prizes.reduce((sum, prize) => sum + prize.quantity, 0);
  const conditionLabel = props.draft.eligibilityConditions.length ? `${props.draft.eligibilityConditions.length} 项参与条件` : "无额外参与条件";
  const summary = `${props.draft.drawMode === "instant" ? "即时开奖" : "定时开奖"} · ${props.draft.prizes.length} 个奖品 / ${inventory} 份 · ${conditionLabel}`;
  return <footer className="min-w-0 shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
    <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <p title={summary} className="hidden min-w-0 truncate text-xs text-muted md:block">{summary}</p>
      <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:ml-auto sm:w-auto sm:grid-cols-[auto_auto] sm:justify-self-end">
        <DialogClose asChild><Button type="button" variant="secondary" disabled={props.saving} className="min-w-0 w-full px-3 sm:w-auto">取消</Button></DialogClose>
        <Button type="submit" disabled={props.saving} className="min-w-0 w-full px-3 sm:w-auto sm:min-w-32">{props.saving ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Save className="size-4 shrink-0" />}{props.saving ? "保存中..." : "保存活动"}</Button>
      </div>
    </div>
  </footer>;
}

async function saveCampaign(input: Readonly<{
  draft: LotteryFormDraft;
  campaign: LotteryCampaign | null;
  setSaving: (value: boolean) => void;
  setFormError: (value: string) => void;
  onSaved: (campaign: LotteryCampaign) => void;
}>) {
  const body = lotteryRequestBody(input.draft);
  const validationError = campaignInputError(body);
  input.setFormError(validationError ?? "");
  if (validationError) return;
  input.setSaving(true);
  try {
    const path = input.campaign ? `/api/lottery/campaigns/${input.campaign.id}` : "/api/lottery/campaigns";
    const campaign = await requestJson<LotteryCampaign>(path, { method: input.campaign ? "PATCH" : "POST", body: JSON.stringify(body) });
    input.onSaved(campaign);
    toast.success(input.campaign ? "活动已更新" : "活动已创建");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.setFormError(message);
    toast.error(message);
  } finally {
    input.setSaving(false);
  }
}
