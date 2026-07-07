import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBotHelpReply,
  buildRateCommandReply,
  extractMentionCommand,
  resolveBotCommand,
} from "../src/bot/command.ts";

test("extracts command text only when the message starts with the target bot mention", () => {
  assert.equal(extractMentionCommand("[CQ:at,qq=12345] 倍率", "12345"), "倍率");
  assert.equal(extractMentionCommand("hello [CQ:at,qq=12345] 倍率", "12345"), null);
  assert.equal(extractMentionCommand("[CQ:at,qq=54321] 倍率", "12345"), null);
});

test("resolves passive mention commands for the configured group", () => {
  const settings = {
    enabled: true,
    mentionCommandEnabled: true,
    targetGroupId: "9001",
    botUserId: "12345",
  };

  assert.deepEqual(resolveBotCommand({
    settings,
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] help",
    },
  }), {
    action: "reply-help",
    groupId: "9001",
    userId: "42",
  });

  const decision = resolveBotCommand({
    settings,
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 当前分组倍率",
    },
  });

  assert.deepEqual(decision, {
    action: "reply-rate",
    groupId: "9001",
    userId: "42",
  });

  assert.deepEqual(resolveBotCommand({
    settings,
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 绑定 user@example.com",
    },
  }), {
    action: "bind-user",
    groupId: "9001",
    userId: "42",
    email: "user@example.com",
  });

  assert.deepEqual(resolveBotCommand({
    settings,
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 解绑",
    },
  }), {
    action: "unbind-user",
    groupId: "9001",
    userId: "42",
  });

  assert.deepEqual(resolveBotCommand({
    settings,
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 邀请排行",
    },
  }), {
    action: "reply-invite",
    groupId: "9001",
    userId: "42",
    inviteCommand: "leaderboard",
  });
});

test("skips commands outside the configured group", () => {
  const decision = resolveBotCommand({
    settings: {
      enabled: true,
      mentionCommandEnabled: true,
      targetGroupId: "9001",
      botUserId: "12345",
    },
    message: {
      messageType: "group",
      groupId: "9002",
      userId: "42",
      text: "[CQ:at,qq=12345] 倍率",
    },
  });

  assert.equal(decision.action, "skip");
  assert.match(decision.reason, /非目标 QQ 群消息/);
});

test("skips disabled individual mention commands", () => {
  const baseSettings = {
    enabled: true,
    mentionCommandEnabled: true,
    targetGroupId: "9001",
    botUserId: "12345",
  };

  assert.deepEqual(resolveBotCommand({
    settings: {
      ...baseSettings,
      commandSettings: {
        help: true,
        rate: false,
        bind: true,
        unbind: true,
        inviteHelp: true,
        inviteMine: true,
        inviteLeaderboard: true,
      },
    },
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 倍率",
    },
  }), {
    action: "skip",
    reason: "倍率查询指令已关闭",
  });

  assert.deepEqual(resolveBotCommand({
    settings: {
      ...baseSettings,
      commandSettings: {
        help: true,
        rate: true,
        bind: true,
        unbind: true,
        inviteHelp: true,
        inviteMine: true,
        inviteLeaderboard: false,
      },
    },
    message: {
      messageType: "group",
      groupId: "9001",
      userId: "42",
      text: "[CQ:at,qq=12345] 邀请排行",
    },
  }), {
    action: "skip",
    reason: "邀请排行指令已关闭",
  });
});

test("builds rate command reply with active groups only", () => {
  const message = buildRateCommandReply({
    groups: [
      { id: 1, name: "标准", status: "active", rateMultiplier: 1.2 },
      { id: 2, name: "停用", status: "disabled", rateMultiplier: 9 },
    ],
    generatedAt: new Date("2026-07-06T08:00:00.000Z"),
  });

  assert.match(message, /^当前分组倍率\n/);
  assert.match(message, /- 标准：1.2/);
  assert.doesNotMatch(message, /停用/);
});

test("builds help reply for the current bot abilities", () => {
  const message = buildBotHelpReply();

  assert.match(message, /^可触发指令\n/);
  assert.match(message, /@bot 绑定 <邮箱>/);
  assert.match(message, /@bot 解绑/);
  assert.match(message, /@bot 邀请/);
  assert.match(message, /@bot 我的邀请/);
  assert.match(message, /@bot 邀请排行/);
  assert.match(message, /@bot 分组 \/ @bot 倍率/);
});
