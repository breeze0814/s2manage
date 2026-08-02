"use client";

import { TicketCheck, UserPlus, WalletCards, type LucideIcon } from "lucide-react";
import {
  DEFAULT_MINIMUM_LOTTERY_BALANCE,
  type LotteryEligibilityCondition,
} from "../../core/lottery-eligibility";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const CONDITION_OPTIONS: readonly ConditionOption[] = [
  { type: "minimum_balance", title: "当前余额大于 X", description: "参与时实时读取目标站余额", icon: WalletCards },
  { type: "redeemed_today", title: "当天使用过兑换码", description: "按上海时区核验真实兑换记录", icon: TicketCheck },
  { type: "invited_today", title: "当天邀请过好友", description: "按上海时区核验新增邀请关系", icon: UserPlus },
];

export function LotteryEligibilityFields(props: Readonly<{
  value: readonly LotteryEligibilityCondition[];
  onChange: (value: LotteryEligibilityCondition[]) => void;
}>) {
  return <fieldset aria-describedby="lottery-eligibility-description">
    <legend className="text-sm font-semibold">参与条件</legend>
    <p id="lottery-eligibility-description" className="mt-1 text-xs leading-5 text-muted">已选择的条件需同时满足；全部关闭表示不限制参与条件。</p>
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      {CONDITION_OPTIONS.map((option) => <ConditionField key={option.type} option={option}
        condition={props.value.find((condition) => condition.type === option.type)}
        onToggle={(enabled) => props.onChange(toggleCondition(props.value, option.type, enabled))}
        onMinimumChange={(minimum) => props.onChange(updateMinimum(props.value, minimum))} />)}
    </div>
  </fieldset>;
}

function ConditionField(props: Readonly<{
  option: ConditionOption;
  condition: LotteryEligibilityCondition | undefined;
  onToggle: (enabled: boolean) => void;
  onMinimumChange: (minimum: number) => void;
}>) {
  const checked = Boolean(props.condition);
  const checkboxId = `lottery-condition-${props.option.type}`;
  const minimum = props.condition?.type === "minimum_balance" ? props.condition.minimum : DEFAULT_MINIMUM_LOTTERY_BALANCE;
  const Icon = props.option.icon;
  return <div className={`rounded-lg border p-3 transition-[border-color,background-color,box-shadow] duration-200 ${checked ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border bg-surface"}`}>
    <div className="flex min-h-12 items-start gap-3">
      <Checkbox id={checkboxId} checked={checked} onCheckedChange={(value) => props.onToggle(value === true)} className="mt-0.5" />
      <Label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
        <span><span className="block font-medium">{props.option.title}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted">{props.option.description}</span></span>
      </Label>
    </div>
    {props.option.type === "minimum_balance" && checked ? <Label htmlFor="lottery-minimum-balance" className="mt-3 block border-t border-border pt-3">
      <span className="mb-1.5 block text-xs text-muted">余额阈值 X</span>
      <Input id="lottery-minimum-balance" type="number" inputMode="decimal" min={0} step="any" value={minimum}
        onChange={(event) => props.onMinimumChange(Number(event.target.value))} />
    </Label> : null}
  </div>;
}

function toggleCondition(
  current: readonly LotteryEligibilityCondition[],
  type: LotteryEligibilityCondition["type"],
  enabled: boolean,
) {
  const filtered = current.filter((condition) => condition.type !== type);
  if (!enabled) return filtered;
  return [...filtered, defaultCondition(type)].sort((left, right) => conditionOrder(left.type) - conditionOrder(right.type));
}

function updateMinimum(current: readonly LotteryEligibilityCondition[], minimum: number) {
  return current.map((condition) => condition.type === "minimum_balance"
    ? { ...condition, minimum }
    : condition);
}

function defaultCondition(type: LotteryEligibilityCondition["type"]): LotteryEligibilityCondition {
  return type === "minimum_balance"
    ? { type, minimum: DEFAULT_MINIMUM_LOTTERY_BALANCE }
    : { type };
}

function conditionOrder(type: LotteryEligibilityCondition["type"]) {
  return CONDITION_OPTIONS.findIndex((option) => option.type === type);
}

type ConditionOption = Readonly<{
  type: LotteryEligibilityCondition["type"];
  title: string;
  description: string;
  icon: LucideIcon;
}>;
