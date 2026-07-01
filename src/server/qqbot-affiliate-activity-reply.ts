import type { QqBotAffiliateActivitySummary } from "@/server/qqbot-affiliate-activity";
import type { InviteActivityLeaderboardEntry } from "@/server/invite-activity-rewards";

export function buildInviteReply(summary: QqBotAffiliateActivitySummary) {
  const lines = [
    "邀请活动统计",
    `三日周期：${summary.period.startDate} 至 ${summary.period.endDate}`,
    `邀请活动状态：${summary.affiliateEnabled ? "已开启" : "未开启"}`,
    `周期邀请数：总计 ${summary.periodInviteeCount}，活跃 ${summary.activeInviteeCount}，非活跃 ${summary.inactiveInviteeCount}`,
  ];

  if (!summary.rewardConfig.configured) lines.push("奖励额度：未配置，暂不计算奖励");
  if (summary.viewer) lines.push(formatViewerLine(summary.viewer));

  lines.push("邀请活动排行榜：");
  lines.push(...formatLeaderboardLines(summary.leaderboard));
  return lines.join("\n");
}

function formatRewardAmount(value: number | null) {
  if (value === null) return "未配置";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatViewerLine(viewer: NonNullable<QqBotAffiliateActivitySummary["viewer"]>) {
  return [
    "你的本期邀请",
    `总计 ${viewer.totalInvitees}`,
    `活跃 ${viewer.activeInviteeCount}`,
    `非活跃 ${viewer.inactiveInviteeCount}`,
    `奖励 ${formatRewardAmount(viewer.rewardAmount)}`,
  ].join("，");
}

function formatLeaderboardLines(entries: InviteActivityLeaderboardEntry[]) {
  if (entries.length === 0) return ["暂无邀请数据"];
  return entries.map((entry, index) => [
    `${index + 1}. ${entry.inviterUsername || entry.inviterEmail} (${entry.inviterEmail})`,
    `总计 ${entry.total}`,
    `活跃 ${entry.activeInviteeCount}`,
    `非活跃 ${entry.inactiveInviteeCount}`,
    `奖励 ${formatRewardAmount(entry.rewardAmount)}`,
  ].join("，"));
}
