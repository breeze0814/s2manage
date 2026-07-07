import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInviteLeaderboardReply,
  calculateInviteActivitySummary,
  inviteActivityPeriodForDate,
  inviteActivityPeriodForStartDate,
  inviteActivitySettlementPeriodForStartDate,
  rewardConfigFromSettings,
} from "../src/bot/invite-activity.ts";

test("calculates invite activity summary for a three day period", () => {
  const period = inviteActivityPeriodForDate(new Date("2026-07-07T03:00:00.000Z"));
  const summary = calculateInviteActivitySummary({
    period,
    rewardConfig: rewardConfigFromSettings({
      invite_activity_active_reward_amount: 10,
      invite_activity_inactive_reward_amount: 2,
    }),
    affiliateEnabled: true,
    invites: [
      { inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 },
      { inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 102 },
      { inviter_id: 22, inviter_email: "b@example.com", inviter_username: "Bob", invitee_id: 103 },
      { inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 },
    ],
    users: [
      { id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-07T12:00:00+08:00" },
      { id: 102, email: "u102@example.com", balance: 0, last_used_at: "2026-07-07T12:00:00+08:00" },
      { id: 103, email: "u103@example.com", balance: 1, last_used_at: null },
    ],
  });

  assert.equal(summary.period.startDate, "2026-07-07");
  assert.equal(summary.period.endDate, "2026-07-10");
  assert.equal(summary.periodInviteeCount, 3);
  assert.equal(summary.activeInviteeCount, 1);
  assert.equal(summary.inactiveInviteeCount, 2);
  assert.equal(summary.leaderboard[0]?.inviterId, 21);
  assert.equal(summary.leaderboard[0]?.total, 2);
  assert.equal(summary.leaderboard[0]?.rewardAmount, 12);
  assert.equal(summary.leaderboard[1]?.inviterId, 22);
  assert.equal(summary.leaderboard[1]?.rewardAmount, 2);
});

test("calculates current invite activity cycle from the activity start date", () => {
  const period = inviteActivityPeriodForStartDate(
    "2026-07-01",
    new Date("2026-07-08T12:00:00+08:00"),
  );

  assert.equal(period.startDate, "2026-07-07");
  assert.equal(period.endDate, "2026-07-10");
});

test("calculates the latest completed invite activity cycle for settlement", () => {
  assert.equal(
    inviteActivitySettlementPeriodForStartDate("2026-07-01", new Date("2026-07-02T12:00:00+08:00")),
    null,
  );

  const period = inviteActivitySettlementPeriodForStartDate(
    "2026-07-01",
    new Date("2026-07-08T12:00:00+08:00"),
  );

  assert.equal(period?.startDate, "2026-07-04");
  assert.equal(period?.endDate, "2026-07-07");
});

test("builds invite leaderboard reply", () => {
  const summary = calculateInviteActivitySummary({
    period: inviteActivityPeriodForDate(new Date("2026-07-07T03:00:00.000Z")),
    rewardConfig: rewardConfigFromSettings({
      invite_activity_active_reward_amount: 10,
      invite_activity_inactive_reward_amount: 2,
    }),
    affiliateEnabled: true,
    invites: [{ inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 }],
    users: [{ id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-07T12:00:00+08:00" }],
  });

  const reply = buildInviteLeaderboardReply(summary);

  assert.match(reply, /^邀请活动排行榜\n/);
  assert.match(reply, /三日周期：2026-07-07 至 2026-07-10/);
  assert.match(reply, /1\. Alice \(a@example.com\)，总计 1，活跃 1，非活跃 0，奖励 10/);
});
