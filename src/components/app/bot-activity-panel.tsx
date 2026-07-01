"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import {
  Dialog,
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

function useInviteActivityMutations(connectionId: number, currentDate: Date) {
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

  return { saveAffiliateEnabled, saveRewardConfig, showToast };
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
  const { saveAffiliateEnabled, saveRewardConfig, showToast } = useInviteActivityMutations(connectionId, currentDate);
  const summary = inviteActivityQuery.data?.summary as InviteSummary | undefined;
  const affiliateEnabled = Boolean(summary?.affiliateEnabled);
  useRewardInputSync(summary, setActiveReward, setInactiveReward);

  const handleToggle = (checked: boolean) => saveAffiliateEnabled.mutate({ connectionId, enabled: checked });
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
    saveAffiliateEnabled,
    saveRewardConfig,
    summary,
    affiliateEnabled,
    handleToggle,
    handleSaveReward,
  };
}

export function BotActivityPanel({ connectionId }: { connectionId: number }) {
  const state = useInviteActivityPanel(connectionId);

  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <ActivityTrigger affiliateEnabled={state.affiliateEnabled} />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-4 text-primary" />
            邀请活动
          </DialogTitle>
          <DialogDescription>三日周期内按余额和最近使用时间分类计算奖励。</DialogDescription>
        </DialogHeader>
        <ActivityDialogContent state={state} />
      </DialogContent>
    </Dialog>
  );
}
