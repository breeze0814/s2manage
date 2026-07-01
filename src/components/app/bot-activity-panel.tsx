"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Gift, RefreshCw, ToggleLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/toast";

function formatDateInput(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function BotActivityPanel({ connectionId }: { connectionId: number }) {
  const { showToast } = useToast();
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const currentDate = useMemo(() => new Date(`${selectedDate}T00:00:00+08:00`), [selectedDate]);
  const inviteActivityQuery = trpc.botSettings.inviteActivity.useQuery({
    connectionId,
    currentDate,
  });
  const saveAffiliateEnabled = trpc.botSettings.setInviteActivityEnabled.useMutation({
    onSuccess: async () => {
      await utils.botSettings.inviteActivity.invalidate({ connectionId, currentDate });
      showToast({ title: "邀请活动开关已更新", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "邀请活动开关更新失败", description: error.message, variant: "error" });
    },
  });

  const summary = inviteActivityQuery.data?.summary;
  const affiliateEnabled = Boolean(summary?.affiliateEnabled);
  const leaderboard = summary?.leaderboard ?? [];

  const handleToggle = (checked: boolean) => {
    saveAffiliateEnabled.mutate({ connectionId, enabled: checked });
  };

  return (
    <Card>
      <CardHeader className="px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gift className="size-4 text-primary" />
            活动
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={affiliateEnabled ? "success" : "secondary"}>{affiliateEnabled ? "已开启" : "已关闭"}</Badge>
            <Button variant="outline" size="sm" onClick={() => inviteActivityQuery.refetch()} disabled={inviteActivityQuery.isFetching}>
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-sm">启用邀请活动</Label>
            <p className="text-xs text-muted-foreground">控制邀请统计和邀请活动相关指令。</p>
          </div>
          <Switch checked={affiliateEnabled} onCheckedChange={handleToggle} disabled={saveAffiliateEnabled.isPending} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-activity-date" className="text-xs">
              统计日期
            </Label>
            <Input
              id="invite-activity-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">活动说明</Label>
            <div className="space-y-1 rounded-md border border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <div>指令：@bot 邀请</div>
              <div>指令：@bot 我的邀请</div>
              <div>指令：@bot 邀请排行</div>
            </div>
        </div>
      </div>
      {inviteActivityQuery.error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {inviteActivityQuery.error.message}
        </div>
      ) : null}
      <div className="grid gap-2 rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>统计日期：{summary?.date ?? "-"}</div>
        <div>今日已绑定邀请关系：{summary?.todayBoundInviteeCount ?? 0}</div>
        {summary?.viewer ? (
          <>
            <div>你的今日邀请数：{summary.viewer.todayBoundInvitees}</div>
            <div>你的总邀请数：{summary.viewer.totalBoundInvitees}</div>
          </>
        ) : null}
      </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            <h3 className="text-sm font-medium">邀请活动排行榜</h3>
          </div>
          <div className="space-y-2">
            {leaderboard.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">暂无邀请数据</div>
            ) : (
              leaderboard.map((entry: { inviterId: number; inviterEmail: string; inviterUsername?: string | null; total: number }, index: number) => (
                <div key={`${entry.inviterId}-${index}`} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-xs">
                  <span className="truncate">{index + 1}. {entry.inviterUsername || entry.inviterEmail}</span>
                  <span className="shrink-0 text-muted-foreground">{entry.total}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <ToggleLeft className="mt-0.5 size-3.5 shrink-0" />
          <span>@bot 邀请 查看状态和指令，@bot 我的邀请 查看个人数据，@bot 邀请排行 展示当天排行榜前 10 名。</span>
        </div>
      </CardContent>
    </Card>
  );
}
