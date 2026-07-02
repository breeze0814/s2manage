"use client";

import { CalendarDays, CalendarRange, Gift, RefreshCw, Save, Trophy, UserCheck, UserMinus, Users } from "lucide-react";
import { EmptyState, InlineError, LoadingState } from "@/components/app/feedback-state";
import { MetricCard } from "@/components/app/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type InviteEntry = {
  inviterId: number;
  inviterEmail: string;
  inviterUsername?: string | null;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  total: number;
  rewardAmount: number | null;
};

export type InviteSummary = {
  affiliateEnabled: boolean;
  period: { startDate: string; endDate: string };
  periodInviteeCount: number;
  activeInviteeCount: number;
  inactiveInviteeCount: number;
  missingUserCount: number;
  rewardConfig: {
    activeRewardAmount: number | null;
    inactiveRewardAmount: number | null;
    configured: boolean;
  };
  viewer?: {
    totalInvitees: number;
    activeInviteeCount: number;
    inactiveInviteeCount: number;
    rewardAmount: number | null;
  };
  leaderboard: InviteEntry[];
};

export type BotActivityPanelState = {
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  activeReward: string;
  setActiveReward: (value: string) => void;
  inactiveReward: string;
  setInactiveReward: (value: string) => void;
  inviteActivityQuery: { error: { message: string } | null; isFetching: boolean; refetch: () => unknown };
  saveAffiliateEnabled: { isPending: boolean };
  saveRewardConfig: { isPending: boolean };
  summary?: InviteSummary;
  affiliateEnabled: boolean;
  handleToggle: (checked: boolean) => void;
  handleSaveReward: () => void;
};

export function formatDateInput(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseRewardInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function ActivityTrigger({ affiliateEnabled }: { affiliateEnabled: boolean }) {
  return (
    <DialogTrigger asChild>
      <Button variant="outline" className="min-h-11 w-full justify-between px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Gift className="size-4 text-primary" />
          邀请活动
        </span>
        <Badge variant={affiliateEnabled ? "success" : "secondary"}>{affiliateEnabled ? "已开启" : "查看"}</Badge>
      </Button>
    </DialogTrigger>
  );
}

export function ActivityDialogContent({ state }: { state: BotActivityPanelState }) {
  return (
    <div className="space-y-3">
      <ActivitySwitch state={state} />
      <ActivityControls state={state} />
      <ActivityQueryState state={state} />
      <ActivityMetrics summary={state.summary} />
      <ViewerStats summary={state.summary} />
      <RankingSection state={state} />
      <ActivityNotice />
    </div>
  );
}

function formatReward(value: number | null | undefined) {
  if (value === null || value === undefined) return "未配置";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function RewardField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Leaderboard({ entries }: { entries: InviteEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="暂无邀请数据" description="选择周期后可查看邀请人数、活跃状态和奖励排行。" className="py-6" />;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={`${entry.inviterId}-${index}`} className="rounded-md border border-border/70 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 whitespace-normal break-all leading-5 [overflow-wrap:anywhere]">{index + 1}. {entry.inviterUsername || entry.inviterEmail}</span>
            <span className="shrink-0 font-medium tabular-nums">奖励 {formatReward(entry.rewardAmount)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            <span>总计 {entry.total}</span>
            <span>活跃 {entry.activeInviteeCount}</span>
            <span>非活跃 {entry.inactiveInviteeCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivitySwitch({ state }: { state: BotActivityPanelState }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
      <div className="min-w-0">
        <Label htmlFor="invite-activity-enabled" className="text-sm">启用邀请活动</Label>
        <p className="text-xs text-muted-foreground">控制邀请统计和 @bot 邀请 指令。</p>
      </div>
      <Switch id="invite-activity-enabled" checked={state.affiliateEnabled} onCheckedChange={state.handleToggle} disabled={state.saveAffiliateEnabled.isPending} />
    </div>
  );
}

function ActivityControls({ state }: { state: BotActivityPanelState }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-1.5">
        <Label htmlFor="invite-activity-date" className="text-xs">
          周期开始日
        </Label>
        <Input id="invite-activity-date" type="date" value={state.selectedDate} onChange={(event) => state.setSelectedDate(event.target.value)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <RewardField id="invite-active-reward" label="活跃奖励额度" value={state.activeReward} onChange={state.setActiveReward} />
        <RewardField id="invite-inactive-reward" label="非活跃奖励额度" value={state.inactiveReward} onChange={state.setInactiveReward} />
        <Button className="w-full lg:w-auto lg:self-end" size="sm" onClick={state.handleSaveReward} disabled={state.saveRewardConfig.isPending}>
          <Save className="size-4" />
          {state.saveRewardConfig.isPending ? "保存中..." : "保存奖励"}
        </Button>
      </div>
    </div>
  );
}

function ActivityQueryState({ state }: { state: BotActivityPanelState }) {
  if (state.inviteActivityQuery.error) {
    return <InlineError>{state.inviteActivityQuery.error.message}</InlineError>;
  }
  if (state.inviteActivityQuery.isFetching && !state.summary) {
    return <LoadingState label="正在加载邀请活动数据..." className="min-h-20 py-4" />;
  }
  return null;
}

function ActivityMetrics({ summary }: { summary?: InviteSummary }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="三日周期" value={summary ? "3 日" : "-"} detail={summary ? `${summary.period.startDate} 至 ${summary.period.endDate}` : "选择日期后加载"} icon={CalendarRange} tone="info" />
      <MetricCard title="本期邀请" value={summary?.periodInviteeCount ?? 0} detail="周期内新增邀请" icon={Users} tone="neutral" />
      <MetricCard title="活跃用户" value={summary?.activeInviteeCount ?? 0} detail="余额与使用状态达标" icon={UserCheck} tone="success" />
      <MetricCard title="非活跃用户" value={summary?.inactiveInviteeCount ?? 0} detail="需继续激活" icon={UserMinus} tone="warning" />
    </div>
  );
}

function ViewerStats({ summary }: { summary?: InviteSummary }) {
  if (!summary?.viewer) return null;
  return (
    <div className="grid gap-2 rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
      <div>你的本期邀请：{summary.viewer.totalInvitees}</div>
      <div>活跃：{summary.viewer.activeInviteeCount}</div>
      <div>非活跃：{summary.viewer.inactiveInviteeCount}</div>
      <div>奖励：{formatReward(summary.viewer.rewardAmount)}</div>
    </div>
  );
}

function RankingSection({ state }: { state: BotActivityPanelState }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Trophy className="size-4 text-primary" />
          邀请活动排行榜
        </h3>
        <Button variant="outline" size="sm" onClick={() => state.inviteActivityQuery.refetch()} disabled={state.inviteActivityQuery.isFetching}>
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </div>
      <Leaderboard entries={state.summary?.leaderboard ?? []} />
    </div>
  );
}

function ActivityNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
      <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
      <span>@bot 邀请 会返回当前三日周期内的活跃/非活跃邀请数和奖励。</span>
    </div>
  );
}
