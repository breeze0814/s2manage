import { ShieldCheck, TicketCheck, UserPlus, WalletCards, type LucideIcon } from "lucide-react";
import {
  lotteryEligibilityRequirement,
  type LotteryEligibilityCondition,
} from "../core/lottery-eligibility";

const CONDITION_ICONS: Readonly<Record<LotteryEligibilityCondition["type"], LucideIcon>> = {
  minimum_balance: WalletCards,
  redeemed_today: TicketCheck,
  invited_today: UserPlus,
};

export function LotteryEligibilitySummary(props: Readonly<{
  conditions: readonly LotteryEligibilityCondition[];
  className?: string;
}>) {
  return <div className={props.className}>
    <p className="flex items-center gap-2 text-xs font-semibold text-muted"><ShieldCheck className="size-4 text-primary-strong" />参与条件</p>
    {props.conditions.length ? <ul className="mt-2 grid gap-2 text-xs">
      {props.conditions.map((condition) => <ConditionItem key={condition.type} condition={condition} />)}
    </ul> : <p className="mt-2 text-xs leading-5 text-muted">无额外参与条件</p>}
  </div>;
}

function ConditionItem({ condition }: Readonly<{ condition: LotteryEligibilityCondition }>) {
  const Icon = CONDITION_ICONS[condition.type];
  return <li className="flex items-center gap-2 leading-5"><Icon className="size-3.5 shrink-0 text-primary-strong" aria-hidden="true" /><span>{lotteryEligibilityRequirement(condition)}</span></li>;
}
