import assert from "node:assert/strict";
import { test } from "node:test";
import { handleIncomingBotMessage } from "../src/bot/handler.ts";
import type { BotStorage } from "../src/bot/storage.ts";

test("bot handler binds a QQ user and replies in group", async () => {
  const replies: Array<{ groupId: string; message: string }> = [];
  let savedSub2UserId = 0;
  const storage: BotStorage = {
    async findBindingByQqUserId() {
      return null;
    },
    async findBindingBySub2UserId() {
      return null;
    },
    async upsertUserBinding(binding) {
      savedSub2UserId = binding.sub2UserId;
      return { id: 1, ...binding };
    },
    async deleteUserBinding() {
      return null;
    },
    async findInviteRewardGrant() {
      return null;
    },
    async upsertInviteRewardGrant() {
      throw new Error("not used");
    },
    async markInviteRewardIssued() {
      throw new Error("not used");
    },
    async markInviteRewardFailed() {
      throw new Error("not used");
    },
  };

  const result = await handleIncomingBotMessage({
    now: new Date("2026-07-07T03:00:00.000Z"),
    settings: {
      enabled: true,
      mentionCommandEnabled: true,
      targetGroupId: "9001",
      botUserId: "12345",
    },
    target: { name: "主站", baseUrl: "https://target.example.com", adminApiKey: "secret" },
    targetGroups: [],
    storage,
    client: {
      async searchUsers() {
        return {
          items: [{ id: 21, email: "user@example.com", username: "Alice", balance: 1, last_used_at: null }],
          total: 1,
          page: 1,
          page_size: 50,
          pages: 1,
        };
      },
      async getSettings() {
        return {};
      },
      async listAffiliateInvites() {
        throw new Error("not used");
      },
      async generateRedeemCodes() {
        throw new Error("not used");
      },
    },
    messenger: {
      async sendGroupMessage(groupId, message) {
        replies.push({ groupId, message });
      },
      async sendPrivateMessage() {
        throw new Error("not used");
      },
    },
    data: {
      message_type: "group",
      group_id: 9001,
      user_id: 712127095,
      raw_message: "[CQ:at,qq=12345] 绑定 user@example.com",
    },
  });

  assert.equal(result.action, "bind-user");
  assert.equal(savedSub2UserId, 21);
  assert.equal(replies[0]?.groupId, "9001");
  assert.match(replies[0]?.message ?? "", /^\[CQ:at,qq=712127095\] 绑定成功/);
});

test("bot invite leaderboard uses local activity cycle and rewards", async () => {
  const replies: Array<{ groupId: string; message: string }> = [];
  const storage: BotStorage = {
    async findBindingByQqUserId() {
      return null;
    },
    async findBindingBySub2UserId() {
      return null;
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
    async upsertInviteRewardGrant() {
      throw new Error("not used");
    },
    async markInviteRewardIssued() {
      throw new Error("not used");
    },
    async markInviteRewardFailed() {
      throw new Error("not used");
    },
  };

  await handleIncomingBotMessage({
    now: new Date("2026-07-08T12:00:00+08:00"),
    settings: {
      enabled: true,
      mentionCommandEnabled: true,
      targetGroupId: "9001",
      botUserId: "12345",
      inviteActivityStartDate: "2026-07-01",
      inviteActivityActiveRewardAmount: 10,
      inviteActivityInactiveRewardAmount: 2,
    },
    target: { name: "主站", baseUrl: "https://target.example.com", adminApiKey: "secret" },
    targetGroups: [],
    storage,
    client: {
      async searchUsers() {
        return {
          items: [{ id: 101, email: "u101@example.com", balance: 1, last_used_at: "2026-07-08T10:00:00+08:00" }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        };
      },
      async getSettings() {
        return { affiliate_enabled: true };
      },
      async listAffiliateInvites(input) {
        assert.equal(input.startAt, "2026-07-07");
        assert.equal(input.endAt, "2026-07-10");
        return {
          items: [{ inviter_id: 21, inviter_email: "a@example.com", inviter_username: "Alice", invitee_id: 101 }],
          total: 1,
          page: 1,
          page_size: 20,
          pages: 1,
        };
      },
      async generateRedeemCodes() {
        throw new Error("not used");
      },
    },
    messenger: {
      async sendGroupMessage(groupId, message) {
        replies.push({ groupId, message });
      },
      async sendPrivateMessage() {
        throw new Error("not used");
      },
    },
    data: {
      message_type: "group",
      group_id: 9001,
      user_id: 712127095,
      raw_message: "[CQ:at,qq=12345] 邀请排行",
    },
  });

  assert.match(replies[0]?.message ?? "", /三日周期：2026-07-07 至 2026-07-10/);
  assert.match(replies[0]?.message ?? "", /奖励 10/);
});
