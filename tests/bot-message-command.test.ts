import assert from "node:assert/strict";
import {
  buildQqBotMentionReplyMessage,
  buildQqBotRateCommandReplyMessage,
  isQqBotMentioned,
  isQqBotRateCommand,
  isQqBotTargetGroupMessage,
  normalizeQqBotIncomingMessage,
  resolveQqBotMessageCommandDecision,
} from "../src/server/bot-settings";

const mentionedRateMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "[CQ:at,qq=2431959203] 当前分组倍率",
});

assert.equal(mentionedRateMessage.messageType, "group");
assert.equal(mentionedRateMessage.subType, "normal");
assert.equal(mentionedRateMessage.groupId, "1035220036");
assert.equal(mentionedRateMessage.userId, "712127095");
assert.equal(mentionedRateMessage.text, "[CQ:at,qq=2431959203] 当前分组倍率");
assert.equal(isQqBotTargetGroupMessage(mentionedRateMessage, "1035220036"), true);
assert.equal(isQqBotTargetGroupMessage(mentionedRateMessage, "10000"), false);
assert.equal(isQqBotMentioned(mentionedRateMessage.text, "2431959203"), true);
assert.equal(isQqBotRateCommand(mentionedRateMessage.text), true);

const mentionedNonCommandMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "[CQ:at,qq=2431959203] 签到",
});

assert.equal(isQqBotMentioned(mentionedNonCommandMessage.text, "2431959203"), true);
assert.equal(isQqBotRateCommand(mentionedNonCommandMessage.text), false);

const normalMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "1111",
});

assert.equal(isQqBotMentioned(normalMessage.text, "2431959203"), false);
assert.equal(isQqBotRateCommand(normalMessage.text), false);

assert.equal(
  buildQqBotMentionReplyMessage("712127095", "当前分组倍率\n- 默认分组：1"),
  "[CQ:at,qq=712127095] 当前分组倍率\n- 默认分组：1",
);

const enabledSettings = {
  enabled: true,
  mentionKeywordEnabled: true,
  targetGroupId: "1035220036",
  botUserId: "2431959203",
};

const decision = resolveQqBotMessageCommandDecision({
  settings: enabledSettings,
  runtimeBotUserId: "",
  data: {
    message_type: "group",
    sub_type: "normal",
    group_id: 1035220036,
    user_id: 712127095,
    raw_message: "[CQ:at,qq=2431959203] 分组",
  },
});

assert.equal(decision.action, "reply-rate");
assert.equal(decision.botUserId, "2431959203");
assert.equal(decision.message.groupId, "1035220036");
assert.equal(decision.message.userId, "712127095");
assert.equal(decision.message.text, "[CQ:at,qq=2431959203] 分组");

assert.match(
  resolveQqBotMessageCommandDecision({
    settings: { ...enabledSettings, mentionKeywordEnabled: false },
    runtimeBotUserId: "",
    data: {
      message_type: "group",
      sub_type: "normal",
      group_id: 1035220036,
      user_id: 712127095,
      raw_message: "[CQ:at,qq=2431959203] 分组",
    },
  }).reason ?? "",
  /@ 关键字触发未开启/,
);

assert.match(
  resolveQqBotMessageCommandDecision({
    settings: { ...enabledSettings, botUserId: "" },
    runtimeBotUserId: "",
    data: {
      message_type: "group",
      sub_type: "normal",
      group_id: 1035220036,
      user_id: 712127095,
      raw_message: "[CQ:at,qq=2431959203] 分组",
    },
  }).reason ?? "",
  /未获取当前 Bot QQ/,
);

const commandReply = buildQqBotRateCommandReplyMessage({
  groups: [
    { id: 1, name: "余额", status: "active", rate_multiplier: 1.1167 },
    { id: 2, name: "关闭分组", status: "disabled", rate_multiplier: 9 },
    { id: 3, name: "team福利分组 不定时开放", status: 1, rate_multiplier: 0.1 },
  ],
  generatedAt: new Date("2026-06-29T09:03:41.000Z"),
});

assert.match(commandReply, /^当前分组倍率\n/);
assert.match(commandReply, /- 余额：1.1167/);
assert.match(commandReply, /- team福利分组 不定时开放：0.1/);
assert.doesNotMatch(commandReply, /关闭分组/);
assert.doesNotMatch(commandReply, /^me$/m);
