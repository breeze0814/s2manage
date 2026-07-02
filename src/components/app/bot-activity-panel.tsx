"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/toast";
import {
  ActivityDialogContent,
  ActivityTrigger,
  formatDateInput,
  parseRewardInput,
  type BotActivityPanelState,
  type InviteSummary,
} from "@/components/app/bot-activity-panel-parts";

function useInviteActivityMutations(connectionId: number, currentDate: Date, periodStartDate: string) {
  const { showToast } = useToast();
  const utils = trpc.useUtils();
  const saveAffiliateEnabled = trpc.botSettings.setInviteActivityEnabled.useMutation({
    onSuccess: async () => {
      await utils.botSettings.inviteActivity.invalidate({ connectionId, currentDate });
      showToast({ title: "邀请活动开关已更新", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "邀请活动开关更新失败", description: error.message, variant: "error" });
    },
  });
  const saveRewardConfig = trpc.botSettings.setInviteActivityRewardConfig.useMutation({
    onSuccess: async () => {
      await utils.botSettings.inviteActivity.invalidate({ connectionId, currentDate });
      showToast({ title: "邀请活动奖励已保存", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "邀请活动奖励保存失败", description: error.message, variant: "error" });
    },
  });
  const retryRewardGrants = trpc.botSettings.retryInviteActivityRewardGrants.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.botSettings.inviteActivity.invalidate({ connectionId, currentDate }),
        utils.botSettings.inviteActivityRewardGrants.invalidate({ connectionId, periodStartDate }),
      ]);
      showToast({
        title: result.failed > 0 ? "邀请活动奖励部分补发失败" : "邀请活动奖励补发完成",
        description: `处理 ${result.retried} 条，成功 ${result.issued}，失败 ${result.failed}`,
        variant: result.failed > 0 ? "error" : "success",
      });
    },
    onError: (error) => {
      showToast({ title: "邀请活动奖励补发失败", description: error.message, variant: "error" });
    },
  });

  return { retryRewardGrants, saveAffiliateEnabled, saveRewardConfig, showToast };
}

function useRewardInputSync(summary: InviteSummary | undefined, setActiveReward: (value: string) => void, setInactiveReward: (value: string) => void) {
  useEffect(() => {
    if (summary?.rewardConfig.activeRewardAmount !== null && summary?.rewardConfig.activeRewardAmount !== undefined) {
      setActiveReward(String(summary.rewardConfig.activeRewardAmount));
    }
    if (summary?.rewardConfig.inactiveRewardAmount !== null && summary?.rewardConfig.inactiveRewardAmount !== undefined) {
      setInactiveReward(String(summary.rewardConfig.inactiveRewardAmount));
    }
  }, [setActiveReward, setInactiveReward, summary?.rewardConfig.activeRewardAmount, summary?.rewardConfig.inactiveRewardAmount]);
}

function useInviteActivityPanel(connectionId: number): BotActivityPanelState & { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [activeReward, setActiveReward] = useState("");
  const [inactiveReward, setInactiveReward] = useState("");
  const currentDate = useMemo(() => new Date(`${selectedDate}T00:00:00+08:00`), [selectedDate]);
  const inviteActivityQuery = trpc.botSettings.inviteActivity.useQuery({ connectionId, currentDate }, { enabled: open });
  const rewardGrantsQuery = trpc.botSettings.inviteActivityRewardGrants.useQuery({ connectionId, periodStartDate: selectedDate }, { enabled: open });
  const { retryRewardGrants, saveAffiliateEnabled, saveRewardConfig, showToast } = useInviteActivityMutations(connectionId, currentDate, selectedDate);
  const summary = inviteActivityQuery.data?.summary as InviteSummary | undefined;
  const affiliateEnabled = Boolean(summary?.affiliateEnabled);
  useRewardInputSync(summary, setActiveReward, setInactiveReward);

  const handleToggle = (checked: boolean) => saveAffiliateEnabled.mutate({ connectionId, enabled: checked });
  const handleRetryRewardGrants = () => retryRewardGrants.mutate({ connectionId, periodStartDate: selectedDate });
  const handleSaveReward = () => {
    const activeRewardAmount = parseRewardInput(activeReward);
    const inactiveRewardAmount = parseRewardInput(inactiveReward);
    if (activeRewardAmount === null || inactiveRewardAmount === null) {
      showToast({ title: "奖励额度必须是非负数字", variant: "error" });
      return;
    }
    saveRewardConfig.mutate({ connectionId, activeRewardAmount, inactiveRewardAmount });
  };

  return {
    open,
    setOpen,
    selectedDate,
    setSelectedDate,
    activeReward,
    setActiveReward,
    inactiveReward,
    setInactiveReward,
    inviteActivityQuery,
    rewardGrantsQuery,
    retryRewardGrants,
    saveAffiliateEnabled,
    saveRewardConfig,
    summary,
    affiliateEnabled,
    handleRetryRewardGrants,
    handleToggle,
    handleSaveReward,
  };
}

export function BotActivityPanel({ connectionId }: { connectionId: number }) {
  const state = useInviteActivityPanel(connectionId);

  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <ActivityTrigger affiliateEnabled={state.affiliateEnabled} />
      <DialogContent className="flex max-h-[min(92dvh,720px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-4 text-primary" />
            邀请活动
          </DialogTitle>
          <DialogDescription>三日周期内按余额和最近使用时间分类计算奖励。</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex-1 space-y-3 py-5">
          <ActivityDialogContent state={state} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
