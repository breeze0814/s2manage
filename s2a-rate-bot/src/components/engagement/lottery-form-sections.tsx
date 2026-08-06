"use client";

import { CalendarClock, CalendarDays, CalendarRange, Eye, ShieldCheck, Sparkles, Timer, UsersRound, type LucideIcon } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { LotteryEligibilityFields } from "./lottery-eligibility-fields";
import { LotteryFormSection } from "./lottery-form-section";
import { changeLotteryMode, lotteryModePreset, type LotteryFormDraft, type LotteryModePreset } from "./lottery-form-model";

export function LotteryActivityFields(props: DraftProps) {
  const draft = props.value;
  return <LotteryFormSection id="lottery-activity-heading" icon={CalendarRange} title="活动信息" description="填写活动内容，并选择即时或定时开奖。">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="space-y-4">
        <Field id="lottery-name" label="活动名称" required><Input id="lottery-name" required autoFocus value={draft.name} placeholder="例如：周末幸运抽奖" onChange={(event) => props.onChange({ ...draft, name: event.target.value })} /></Field>
        <Field id="lottery-description" label="活动说明"><Textarea id="lottery-description" className="min-h-28 resize-y" value={draft.description} placeholder="向用户说明活动主题或奖品信息" onChange={(event) => props.onChange({ ...draft, description: event.target.value })} /></Field>
      </div>
      <LotteryModeField value={lotteryModePreset(draft)} onChange={(mode) => props.onChange(changeLotteryMode(draft, mode))} />
    </div>
    <div className="mt-5 border-t border-border pt-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Timer className="size-4 text-primary-strong" aria-hidden="true" />活动时间</p>
      <div className={`grid gap-4 sm:grid-cols-2 ${draft.drawMode === "scheduled" ? "lg:grid-cols-3" : ""}`}>
        <DateField id="lottery-registration-start" label="活动开始" required={draft.participationMode === "daily"} value={draft.registrationStart} onChange={(registrationStart) => props.onChange({ ...draft, registrationStart })} />
        <DateField id="lottery-registration-end" label="活动结束" required={draft.drawMode === "scheduled" || draft.participationMode === "daily"} value={draft.registrationEnd} onChange={(registrationEnd) => props.onChange({ ...draft, registrationEnd })} />
        {draft.drawMode === "scheduled" ? <DateField id="lottery-draw-at" label="开奖时间" required value={draft.drawAt} onChange={(drawAt) => props.onChange({ ...draft, drawAt })} /> : null}
      </div>
    </div>
  </LotteryFormSection>;
}

export function LotteryParticipationFields(props: DraftProps) {
  const draft = props.value;
  return <LotteryFormSection id="lottery-participation-heading" icon={ShieldCheck} title="参与规则" description="配置参与频率、用户准入条件与活动公开范围。">
    <div>
      <LotteryEligibilityFields value={draft.eligibilityConditions} onChange={(eligibilityConditions) => props.onChange({ ...draft, eligibilityConditions })} />
    </div>
    <div className="mt-5 border-t border-border pt-5">
      <p className="mb-3 text-sm font-semibold">公开设置</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleSetting id="lottery-visible-to-users" icon={Eye} title="展示给用户" description="关闭后用户端不可见且不能参与" checked={draft.visibleToUsers} onChange={(visibleToUsers) => props.onChange({ ...draft, visibleToUsers })} />
        <ToggleSetting id="lottery-public-winners" icon={UsersRound} title="公开中奖名单" description="仅展示脱敏邮箱，不公开兑换码" checked={draft.publicWinners} onChange={(publicWinners) => props.onChange({ ...draft, publicWinners })} />
      </div>
    </div>
  </LotteryFormSection>;
}

function LotteryModeField(props: Readonly<{
  value: LotteryModePreset;
  onChange: (value: LotteryModePreset) => void;
}>) {
  return <fieldset><legend className="mb-2 text-sm font-semibold">抽奖模式</legend>
    <RadioGroup value={props.value} onValueChange={(value) => props.onChange(value as LotteryModePreset)} className="grid gap-2">
      <DrawModeOption value="instant" icon={Sparkles} title="即时开奖" description="每个用户活动期间一次，参与后立即看到结果" />
      <DrawModeOption value="scheduled" icon={CalendarClock} title="定时开奖" description="用户先报名，到达设定时间后统一开奖" />
      <DrawModeOption value="daily" icon={CalendarDays} title="每日一次活动" description="活动期间每个上海自然日可即时参与一次" />
    </RadioGroup>
  </fieldset>;
}

function DrawModeOption(props: Readonly<{
  value: string;
  icon: LucideIcon;
  title: string;
  description: string;
}>) {
  const Icon = props.icon;
  const id = `lottery-draw-mode-${props.value}`;
  const descriptionId = `${id}-description`;
  return <Label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-[border-color,background-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:shadow-sm">
    <RadioGroupItem id={id} value={props.value} aria-describedby={descriptionId} />
    <Icon className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
    <span className="min-w-0"><span className="block text-sm font-semibold">{props.title}</span><span id={descriptionId} className="mt-0.5 block text-xs font-normal leading-5 text-muted">{props.description}</span></span>
  </Label>;
}

function ToggleSetting(props: Readonly<{
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}>) {
  const Icon = props.icon;
  const descriptionId = `${props.id}-description`;
  return <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface px-3">
    <Icon className={`size-4 shrink-0 ${props.checked ? "text-primary-strong" : "text-muted"}`} aria-hidden="true" />
    <Label htmlFor={props.id} className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-medium">{props.title}</span><span id={descriptionId} className="mt-0.5 block text-xs font-normal leading-5 text-muted">{props.description}</span></Label>
    <Switch id={props.id} aria-describedby={descriptionId} checked={props.checked} onCheckedChange={props.onChange} />
  </div>;
}

function Field(props: Readonly<{ id: string; label: string; required?: boolean; children: React.ReactNode }>) {
  return <Label htmlFor={props.id} className="block space-y-1.5 text-sm font-medium"><span>{props.label}{props.required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span>{props.children}</Label>;
}

function DateField(props: Readonly<{
  id: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}>) {
  return <Field id={props.id} label={props.label} required={props.required}><Input id={props.id} type="datetime-local" required={props.required} aria-required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></Field>;
}

type DraftProps = Readonly<{
  value: LotteryFormDraft;
  onChange: (value: LotteryFormDraft) => void;
}>;
