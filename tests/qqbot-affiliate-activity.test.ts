import assert from "node:assert/strict";
import {
  handleQqBotAffiliateActivityCommand,
  resolveQqBotAffiliateActivityCommandDecision,
} from "../src/server/qqbot-affiliate-activity";
import { normalizeQqBotIncomingMessage } from "../src/server/bot-settings";

function createBindingDb(rows: Array<Record<string, unknown>> = []) {
  type BindingRow = {
    id: number;
    connectionId: number;
    qqUserId: string;
    sub2UserId: number;
    sub2Email: string;
    sub2Snapshot: unknown;
  };
  const state: BindingRow[] = rows as BindingRow[];
  const db = {
    qqBotUserBinding: {
      async findUnique(args: Record<string, unknown>) {
        const where = args.where as Record<string, { connectionId: number; qqUserId?: string; sub2UserId?: number }>;
        const qqKey = where.connectionId_qqUserId;
        const sub2Key = where.connectionId_sub2UserId;
        if (qqKey) return state.find((row) => row.connectionId === qqKey.connectionId && row.qqUserId === qqKey.qqUserId) ?? null;
        if (sub2Key) return state.find((row) => row.connectionId === sub2Key.connectionId && row.sub2UserId === sub2Key.sub2UserId) ?? null;
        return null;
      },
      async findMany(args: Record<string, unknown>) {
        const where = args.where as { connectionId?: number } | undefined;
        return state.filter((row) => !where?.connectionId || row.connectionId === where.connectionId);
      },
    },
  };
  return { db, state };
}

const inviteCommandMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "[CQ:at,qq=2431959203] 邀请",
});

assert.equal(
  resolveQqBotAffiliateActivityCommandDecision({
    settings: { enabled: true, mentionKeywordEnabled: true, targetGroupId: "1035220036" },
    botUserId: "2431959203",
    message: inviteCommandMessage,
  }).action,
  "reply-invite",
);

assert.equal(
  resolveQqBotAffiliateActivityCommandDecision({
    settings: { enabled: true, mentionKeywordEnabled: false, targetGroupId: "1035220036" },
    botUserId: "2431959203",
    message: inviteCommandMessage,
  }).action,
  "skip",
);

void (async () => {
  const { db } = createBindingDb([
    { id: 1, connectionId: 1, qqUserId: "712127095", sub2UserId: 21, sub2Email: "1198046748@qq.com", sub2Snapshot: {} },
    { id: 2, connectionId: 1, qqUserId: "800000001", sub2UserId: 58, sub2Email: "1824814636@qq.com", sub2Snapshot: {} },
    { id: 3, connectionId: 1, qqUserId: "800000002", sub2UserId: 59, sub2Email: "1824814637@qq.com", sub2Snapshot: {} },
    { id: 4, connectionId: 1, qqUserId: "800000003", sub2UserId: 60, sub2Email: "1824814638@qq.com", sub2Snapshot: {} },
    { id: 5, connectionId: 1, qqUserId: "800000004", sub2UserId: 61, sub2Email: "1824814639@qq.com", sub2Snapshot: {} },
    { id: 6, connectionId: 1, qqUserId: "800000005", sub2UserId: 62, sub2Email: "1824814640@qq.com", sub2Snapshot: {} },
    { id: 7, connectionId: 1, qqUserId: "800000006", sub2UserId: 63, sub2Email: "1824814641@qq.com", sub2Snapshot: {} },
  ]);

  const dayInvites = [
    {
      inviter_id: 21,
      inviter_email: "1198046748@qq.com",
      inviter_username: "Log7",
      invitee_id: 58,
      invitee_email: "1824814636@qq.com",
      invitee_username: "",
      aff_code: "A1",
      total_rebate: 10,
      created_at: "2026-06-29T09:00:00+08:00",
    },
    {
      inviter_id: 21,
      inviter_email: "1198046748@qq.com",
      inviter_username: "Log7",
      invitee_id: 58,
      invitee_email: "1824814636@qq.com",
      invitee_username: "",
      aff_code: "A1",
      total_rebate: 10,
      created_at: "2026-06-29T09:10:00+08:00",
    },
    {
      inviter_id: 21,
      inviter_email: "1198046748@qq.com",
      inviter_username: "Log7",
      invitee_id: 59,
      invitee_email: "1824814637@qq.com",
      invitee_username: "",
      aff_code: "A1",
      total_rebate: 10,
      created_at: "2026-06-29T09:20:00+08:00",
    },
    {
      inviter_id: 21,
      inviter_email: "1198046748@qq.com",
      inviter_username: "Log7",
      invitee_id: 60,
      invitee_email: "1824814638@qq.com",
      invitee_username: "",
      aff_code: "A1",
      total_rebate: 10,
      created_at: "2026-06-29T09:30:00+08:00",
    },
    {
      inviter_id: 22,
      inviter_email: "2222222222@qq.com",
      inviter_username: "Alice",
      invitee_id: 61,
      invitee_email: "1824814639@qq.com",
      invitee_username: "",
      aff_code: "A2",
      total_rebate: 10,
      created_at: "2026-06-29T10:00:00+08:00",
    },
    {
      inviter_id: 22,
      inviter_email: "2222222222@qq.com",
      inviter_username: "Alice",
      invitee_id: 62,
      invitee_email: "1824814640@qq.com",
      invitee_username: "",
      aff_code: "A2",
      total_rebate: 10,
      created_at: "2026-06-29T10:30:00+08:00",
    },
    {
      inviter_id: 23,
      inviter_email: "3333333333@qq.com",
      inviter_username: "Bob",
      invitee_id: 63,
      invitee_email: "1824814641@qq.com",
      invitee_username: "",
      aff_code: "A3",
      total_rebate: 10,
      created_at: "2026-06-29T11:00:00+08:00",
    },
    {
      inviter_id: 24,
      inviter_email: "4444444444@qq.com",
      inviter_username: "Carol",
      invitee_id: 64,
      invitee_email: "not-bound@example.com",
      invitee_username: "",
      aff_code: "A4",
      total_rebate: 10,
      created_at: "2026-06-29T11:30:00+08:00",
    },
  ];

  const allTimeInvites = [
    ...dayInvites,
    {
      inviter_id: 21,
      inviter_email: "1198046748@qq.com",
      inviter_username: "Log7",
      invitee_id: 65,
      invitee_email: "daily-bound@example.com",
      invitee_username: "",
      aff_code: "A1",
      total_rebate: 10,
      created_at: "2026-06-28T09:00:00+08:00",
    },
  ];

  const replyMessages: string[] = [];
  const result = await handleQqBotAffiliateActivityCommand({
    connectionId: 1,
    qqUserId: "712127095",
    dbClient: db as never,
    sub2Client: {
      async getSettings() {
        return { affiliate_enabled: true };
      },
      async listAffiliateInvites(input: Record<string, unknown>) {
        if (input.startAt === "2026-06-29" && input.endAt === "2026-06-30") {
          return { items: dayInvites, total: dayInvites.length, page: 1, page_size: 100, pages: 1 };
        }
        return { items: allTimeInvites, total: allTimeInvites.length, page: 1, page_size: 100, pages: 1 };
      },
    } as never,
    sendReply: async (message: string) => {
      replyMessages.push(message);
    },
    currentDate: new Date("2026-06-29T12:00:00+08:00"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary?.date, "2026-06-29");
  assert.equal(result.summary?.todayBoundInviteeCount, 6);
  assert.equal(result.summary?.leaderboard[0]?.inviterId, 21);
  assert.equal(result.summary?.leaderboard[0]?.total, 3);
  assert.equal(result.summary?.leaderboard[1]?.inviterId, 22);
  assert.equal(result.summary?.leaderboard[1]?.total, 2);
  assert.equal(result.summary?.leaderboard[2]?.inviterId, 23);
  assert.equal(result.summary?.leaderboard[2]?.total, 1);
  assert.equal(result.summary?.viewer?.sub2UserId, 21);
  assert.equal(result.summary?.viewer?.totalBoundInvitees, 3);
  assert.equal(result.summary?.viewer?.todayBoundInvitees, 3);
  assert.equal(replyMessages.length, 1);
  assert.match(replyMessages[0] ?? "", /邀请活动统计/);
  assert.match(replyMessages[0] ?? "", /你的邀请人数：总计 3，今日 3/);
  assert.match(replyMessages[0] ?? "", /1\. Log7 \(1198046748@qq.com\)：3/);
  assert.match(replyMessages[0] ?? "", /2\. Alice \(2222222222@qq.com\)：2/);

  const disabledReplies: string[] = [];
  const disabledResult = await handleQqBotAffiliateActivityCommand({
    connectionId: 1,
    qqUserId: "712127095",
    dbClient: db as never,
    sub2Client: {
      async getSettings() {
        return { affiliate_enabled: false };
      },
      async listAffiliateInvites() {
        throw new Error("should not query invites when disabled");
      },
    } as never,
    sendReply: async (message: string) => {
      disabledReplies.push(message);
    },
    currentDate: new Date("2026-06-29T12:00:00+08:00"),
  });

  assert.equal(disabledResult.ok, false);
  assert.equal(disabledReplies[0], "邀请活动未开启");

  const unboundReplies: string[] = [];
  const unboundResult = await handleQqBotAffiliateActivityCommand({
    connectionId: 1,
    qqUserId: "999999999",
    dbClient: db as never,
    sub2Client: {
      async getSettings() {
        return { affiliate_enabled: true };
      },
      async listAffiliateInvites() {
        throw new Error("should not query invites when unbound");
      },
    } as never,
    sendReply: async (message: string) => {
      unboundReplies.push(message);
    },
    currentDate: new Date("2026-06-29T12:00:00+08:00"),
  });

  assert.equal(unboundResult.ok, false);
  assert.equal(unboundReplies[0], "请先绑定 Sub2 用户后再查询邀请活动");
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
