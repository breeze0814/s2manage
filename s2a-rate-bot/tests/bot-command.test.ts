import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRateCommandReply, extractMentionCommand, resolveBotCommand } from "../src/bot/command.ts";

test("extracts command text only when the message starts with the target bot mention", () => {
  assert.equal(extractMentionCommand("[CQ:at,qq=12345] 倍率", "12345"), "倍率");
  assert.equal(extractMentionCommand("hello [CQ:at,qq=12345] 倍率", "12345"), null);
  assert.equal(extractMentionCommand("[CQ:at,qq=54321] 倍率", "12345"), null);
});

test("resolves rate query command for the configured group", () => {
  const decision = resolveBotCommand({
    settings: {
      enabled: true,
      mentionCommandEnabled: true,
      targetGroupId: "9001",
      botUserId: "12345",
    },
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
