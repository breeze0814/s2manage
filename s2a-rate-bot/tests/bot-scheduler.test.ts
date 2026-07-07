import assert from "node:assert/strict";
import { test } from "node:test";
import { runInviteActivityStatsCycle } from "../src/bot/scheduler.ts";
import type { BotStorage } from "../src/bot/storage.ts";

test("invite activity cycle issues redeem codes and sends private messages to bound inviters", async () => {
  const grants: Awaited<ReturnType<BotStorage["upsertInviteRewardGrant"]>>[] = [];
  const messages: Array<{ userId: string; message: string }> = [];
  const storage: BotStorage = {
    async findBindingByQqUserId() {
      return null;
    },
    async findBindingBySub2UserId(sub2UserId) {
      if (sub2UserId !== 21) return null;
      return {
        id: 1,
        qqUserId: "712127095",
        sub2UserId: 21,
        sub2Email: "a@example.com",
        sub2SnapshotJson: "{}",
      };
    },
    async upsertUserBinding() {
      throw new Error("not used");
    },
    async deleteUserBinding() {
      throw new Error("not used");
    },
    async findInviteRewardGrant() {
      return null;
    },
    async upsertInviteRewardGrant(grant) {
      const row = {
        id: grants.length + 1,
        ...grant,
        redeemCodeId: null,
        redeemCode: null,
        error: null,
        status: "pending",
        attemptCount: 0,
      } as Awaited<ReturnType<BotStorage["upsertInviteRewardGrant"]>>;
      grants.push(row);
      return row;
    },
    async markInviteRewardIssued(id, redeemCode) {
      const grant = grants.find((item) => item.id === id);
      assert.ok(grant);
      Object.assign(grant, { status: "issued", redeemCodeId: redeemCode.id, redeemCode: redeemCode.code });
      return grant;
    },
    async markInviteRewardFailed(id, error) {
      const grant = grants.find((item) => item.id === id);
      assert.ok(grant);
      Object.assign(grant, { status: "failed", error });
      return grant;
    },
  };

  const result = await runInviteActivityStatsCycle({
    now: new Date("2026-07-07T03:00:00.000Z"),
    target: { name: "主站", baseUrl: "https://target.example.com", adminApiKey: "secret" },
    storage,
    client: {
      async getSettings() {
        return {
          affiliate_enabled: true,
          invite_activity_active_reward_amount: 10,
          invite_activity_inactive_reward_amount: 2,
        };
      },
      async listAffiliateInvites() {
        return {
          items: [{ inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 }],
          total: 1,
          page: 1,
          page_size: 20,
          pages: 1,
        };
      },
      async searchUsers() {
        return {
          items: [{ id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-07T12:00:00+08:00" }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        };
      },
      async generateRedeemCodes() {
        return [{ id: 9001, code: "reward-code-21", value: 10 }];
      },
    },
    messenger: {
      async sendPrivateMessage(userId, message) {
        messages.push({ userId, message });
      },
    },
  });

  assert.equal(result.summary.periodInviteeCount, 1);
  assert.equal(result.issued, 1);
  assert.equal(result.failed, 0);
  assert.equal(messages[0]?.userId, "712127095");
  assert.match(messages[0]?.message ?? "", /兑换码：reward-code-21/);
  assert.equal(grants[0]?.status, "issued");
});

test("invite activity settlement uses the latest completed three day cycle", async () => {
  const requestedPeriods: Array<{ startAt?: string; endAt?: string }> = [];
  const grants: Awaited<ReturnType<BotStorage["upsertInviteRewardGrant"]>>[] = [];
  const storage: BotStorage = {
    async findBindingByQqUserId() {
      return null;
    },
    async findBindingBySub2UserId() {
      return {
        id: 1,
        qqUserId: "712127095",
        sub2UserId: 21,
        sub2Email: "a@example.com",
        sub2SnapshotJson: "{}",
      };
    },
    async upsertUserBinding() {
      throw new Error("not used");
    },
    async deleteUserBinding() {
      throw new Error("not used");
    },
    async findInviteRewardGrant() {
      return null;
    },
    async upsertInviteRewardGrant(grant) {
      const row = {
        id: grants.length + 1,
        ...grant,
        redeemCodeId: null,
        redeemCode: null,
        error: null,
        status: "pending",
        attemptCount: 0,
      } as Awaited<ReturnType<BotStorage["upsertInviteRewardGrant"]>>;
      grants.push(row);
      return row;
    },
    async markInviteRewardIssued(id, redeemCode) {
      const grant = grants.find((item) => item.id === id);
      assert.ok(grant);
      Object.assign(grant, { status: "issued", redeemCodeId: redeemCode.id, redeemCode: redeemCode.code });
      return grant;
    },
    async markInviteRewardFailed(id, error) {
      const grant = grants.find((item) => item.id === id);
      assert.ok(grant);
      Object.assign(grant, { status: "failed", error });
      return grant;
    },
  };

  const result = await runInviteActivityStatsCycle({
    now: new Date("2026-07-08T12:00:00+08:00"),
    target: { name: "主站", baseUrl: "https://target.example.com", adminApiKey: "secret" },
    bot: {
      enabled: true,
      wsUrl: "ws://127.0.0.1:3001",
      token: "",
      targetGroupId: "10001",
      mentionCommandEnabled: true,
      commandSettings: {
        help: true,
        rate: true,
        bind: true,
        unbind: true,
        inviteHelp: true,
        inviteMine: true,
        inviteLeaderboard: true,
      },
      activePrivateMessageEnabled: true,
      scheduledStatsEnabled: true,
      inviteActivityStartDate: "2026-07-01",
      inviteActivityActiveRewardAmount: 10,
      inviteActivityInactiveRewardAmount: 2,
      botUserId: "90001",
    },
    storage,
    client: {
      async getSettings() {
        return { affiliate_enabled: true };
      },
      async listAffiliateInvites(input) {
        requestedPeriods.push({ startAt: input.startAt, endAt: input.endAt });
        return {
          items: [{ inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 }],
          total: 1,
          page: 1,
          page_size: 20,
          pages: 1,
        };
      },
      async searchUsers() {
        return {
          items: [{ id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-05T12:00:00+08:00" }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        };
      },
      async generateRedeemCodes() {
        return [{ id: 9001, code: "reward-code-21", value: 10 }];
      },
    },
    messenger: {
      async sendPrivateMessage() {},
    },
  });

  assert.equal(result.summary.period.startDate, "2026-07-04");
  assert.equal(result.summary.period.endDate, "2026-07-07");
  assert.deepEqual(requestedPeriods[0], { startAt: "2026-07-04", endAt: "2026-07-07" });
  assert.equal(result.issued, 1);
});
