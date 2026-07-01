import assert from "node:assert/strict";
import {
  ACTIVE_REWARD_SETTING_KEY,
  INACTIVE_REWARD_SETTING_KEY,
  calculateInviteActivityRewards,
  inviteActivityPeriodForDate,
  rewardConfigFromSettings,
} from "../src/server/invite-activity-rewards";

const period = inviteActivityPeriodForDate(new Date("2026-06-29T12:00:00+08:00"));
const rewardConfig = rewardConfigFromSettings({
  [ACTIVE_REWARD_SETTING_KEY]: 12,
  [INACTIVE_REWARD_SETTING_KEY]: "3",
});

const summary = calculateInviteActivityRewards({
  period,
  rewardConfig,
  invites: [
    {
      inviter_id: 21,
      inviter_email: "owner@example.com",
      inviter_username: "Owner",
      invitee_id: 58,
      invitee_email: "active@example.com",
      created_at: "2026-06-29T09:00:00+08:00",
    },
    {
      inviter_id: 21,
      inviter_email: "owner@example.com",
      inviter_username: "Owner",
      invitee_id: 58,
      invitee_email: "active@example.com",
      created_at: "2026-06-29T09:10:00+08:00",
    },
    {
      inviter_id: 21,
      inviter_email: "owner@example.com",
      inviter_username: "Owner",
      invitee_id: 59,
      invitee_email: "inactive@example.com",
      created_at: "2026-06-30T09:00:00+08:00",
    },
    {
      inviter_id: 22,
      inviter_email: "second@example.com",
      inviter_username: "Second",
      invitee_id: 60,
      invitee_email: "zero@example.com",
      created_at: "2026-07-01T09:00:00+08:00",
    },
  ],
  users: [
    { id: 58, email: "active@example.com", balance: 1, last_used_at: "2026-06-30T08:00:00+08:00" },
    { id: 59, email: "inactive@example.com", balance: 2, last_used_at: "2026-06-28T23:59:59+08:00" },
    { id: 60, email: "zero@example.com", balance: 0, last_used_at: "2026-06-30T08:00:00+08:00" },
  ],
});

assert.equal(period.startDate, "2026-06-29");
assert.equal(period.endDate, "2026-07-02");
assert.equal(summary.totalInviteeCount, 3);
assert.equal(summary.activeInviteeCount, 1);
assert.equal(summary.inactiveInviteeCount, 2);

assert.equal(summary.leaderboard[0]?.inviterId, 21);
assert.equal(summary.leaderboard[0]?.total, 2);
assert.equal(summary.leaderboard[0]?.activeInviteeCount, 1);
assert.equal(summary.leaderboard[0]?.inactiveInviteeCount, 1);
assert.equal(summary.leaderboard[0]?.rewardAmount, 15);

assert.equal(summary.leaderboard[1]?.inviterId, 22);
assert.equal(summary.leaderboard[1]?.rewardAmount, 3);
