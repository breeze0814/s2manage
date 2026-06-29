import assert from "node:assert/strict";
import {
  normalizeQqBotIncomingMessage,
} from "../src/server/bot-settings";
import {
  bindQqBotUser,
  resolveQqBotUserBindingCommandDecision,
  unbindQqBotUser,
} from "../src/server/qqbot-user-bindings";

const bindMessageWithoutMention = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "先说话 绑定 xhc0812320@gmail.com [CQ:at,qq=2431959203]",
});

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: bindMessageWithoutMention,
  }).action,
  "skip",
);

const bindMentionNotAtStartMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "先说话 [CQ:at,qq=2431959203] 绑定 xhc0812320@gmail.com",
});

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: bindMentionNotAtStartMessage,
  }).action,
  "skip",
);

const mentionedBindMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "[CQ:at,qq=2431959203] 绑定 xhc0812320@gmail.com",
});

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: mentionedBindMessage,
  }).action,
  "bind-user",
);

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: mentionedBindMessage,
  }).email,
  "xhc0812320@gmail.com",
);

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: normalizeQqBotIncomingMessage({
      message_type: "group",
      sub_type: "normal",
      group_id: 1035220036,
      user_id: 712127095,
      raw_message: " [CQ:at,qq=2431959203] 绑定 xhc0812320@gmail.com",
    }),
  }).action,
  "bind-user",
);

const targetGroupUnbindMessage = normalizeQqBotIncomingMessage({
  message_type: "group",
  sub_type: "normal",
  group_id: 1035220036,
  user_id: 712127095,
  raw_message: "[CQ:at,qq=2431959203] 解绑",
});

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: targetGroupUnbindMessage,
  }).action,
  "unbind-user",
);

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: normalizeQqBotIncomingMessage({
      message_type: "group",
      sub_type: "normal",
      group_id: 10000,
      user_id: 712127095,
      raw_message: "[CQ:at,qq=2431959203] 解绑",
    }),
  }).action,
  "unbind-user",
);

assert.equal(
  resolveQqBotUserBindingCommandDecision({
    settings: { enabled: true },
    botUserId: "2431959203",
    message: normalizeQqBotIncomingMessage({
      message_type: "group",
      sub_type: "normal",
      group_id: 10000,
      user_id: 712127095,
      raw_message: "解绑 [CQ:at,qq=2431959203]",
    }),
  }).action,
  "skip",
);

function createBindingDb(rows: Array<Record<string, unknown>> = []) {
  type BindingRow = {
    id: number;
    connectionId: number;
    qqUserId: string;
    sub2UserId: number;
    sub2Email: string;
    sub2Snapshot: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  const state: BindingRow[] = rows as BindingRow[];
  const db: {
    qqBotUserBinding: {
      findUnique(args: Record<string, unknown>): Promise<BindingRow | null>;
      upsert(args: Record<string, unknown>): Promise<BindingRow>;
      delete(args: Record<string, unknown>): Promise<BindingRow>;
    };
    $transaction<T>(callback: (tx: {
      qqBotUserBinding: {
        findUnique(args: Record<string, unknown>): Promise<BindingRow | null>;
        upsert(args: Record<string, unknown>): Promise<BindingRow>;
        delete(args: Record<string, unknown>): Promise<BindingRow>;
      };
    }) => Promise<T>): Promise<T>;
  } = {
    qqBotUserBinding: {
      async findUnique(args: Record<string, unknown>) {
        const where = args.where as Record<string, unknown>;
        const qqKey = where.connectionId_qqUserId as { connectionId: number; qqUserId: string } | undefined;
        const sub2Key = where.connectionId_sub2UserId as { connectionId: number; sub2UserId: number } | undefined;
        if (qqKey) return state.find((row) => row.connectionId === qqKey.connectionId && row.qqUserId === qqKey.qqUserId) ?? null;
        if (sub2Key) return state.find((row) => row.connectionId === sub2Key.connectionId && row.sub2UserId === sub2Key.sub2UserId) ?? null;
        return null;
      },
      async upsert(args: Record<string, unknown>) {
        const where = args.where as { connectionId_qqUserId: { connectionId: number; qqUserId: string } };
        const create = args.create as Record<string, unknown>;
        const update = args.update as Record<string, unknown>;
        const index = state.findIndex((row) => row.connectionId === where.connectionId_qqUserId.connectionId && row.qqUserId === where.connectionId_qqUserId.qqUserId);
        if (index >= 0) {
          state[index] = { ...state[index], ...update } as BindingRow;
          return state[index];
        }
        const row = {
          id: state.length + 1,
          connectionId: create.connectionId as number,
          qqUserId: create.qqUserId as string,
          sub2UserId: create.sub2UserId as number,
          sub2Email: create.sub2Email as string,
          sub2Snapshot: create.sub2Snapshot,
          createdAt: new Date("2026-06-29T00:00:00.000Z"),
          updatedAt: new Date("2026-06-29T00:00:00.000Z"),
        } as BindingRow;
        state.push(row);
        return row;
      },
      async delete(args: Record<string, unknown>) {
        const where = args.where as { connectionId_qqUserId: { connectionId: number; qqUserId: string } };
        const index = state.findIndex((row) => row.connectionId === where.connectionId_qqUserId.connectionId && row.qqUserId === where.connectionId_qqUserId.qqUserId);
        if (index < 0) throw new Error("Row not found");
        const [deleted] = state.splice(index, 1);
        return deleted as BindingRow;
      },
    },
    async $transaction<T>(callback: (tx: typeof db) => Promise<T>) {
      return callback(db);
    },
  };
  return { db, state };
}

const sub2User = {
  id: 67,
  email: "xhc0812320@gmail.com",
  username: "",
  role: "user",
  balance: 2,
  concurrency: 5,
  status: "active",
};

void (async () => {
  {
    const { db, state } = createBindingDb();
    const result = await bindQqBotUser({
      db: db as unknown as Parameters<typeof bindQqBotUser>[0]["db"],
      connectionId: 1,
      qqUserId: "712127095",
      email: "xhc0812320@gmail.com",
      sub2Client: {
        async searchUsers() {
          return { items: [sub2User], total: 1, page: 1, page_size: 50, pages: 1 };
        },
      },
    });

    assert.equal(result.binding.qqUserId, "712127095");
    assert.equal(result.binding.sub2UserId, 67);
    assert.equal(result.binding.sub2Email, "xhc0812320@gmail.com");
    assert.equal(state.length, 1);
    assert.equal((state[0]?.sub2Snapshot as { email?: string })?.email, "xhc0812320@gmail.com");
  }

  {
    const { db } = createBindingDb([
      {
        id: 1,
        connectionId: 1,
        qqUserId: "888888888",
        sub2UserId: 67,
        sub2Email: "xhc0812320@gmail.com",
        sub2Snapshot: sub2User,
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-29T00:00:00.000Z"),
      },
    ]);

    await assert.rejects(
      () =>
        bindQqBotUser({
          db: db as unknown as Parameters<typeof bindQqBotUser>[0]["db"],
          connectionId: 1,
          qqUserId: "712127095",
          email: "xhc0812320@gmail.com",
          sub2Client: {
            async searchUsers() {
              return { items: [sub2User], total: 1, page: 1, page_size: 50, pages: 1 };
            },
          },
        }),
      /该 Sub2 用户已绑定其他 QQ/,
    );
  }

  {
    const { db, state } = createBindingDb([
      {
        id: 1,
        connectionId: 1,
        qqUserId: "712127095",
        sub2UserId: 67,
        sub2Email: "xhc0812320@gmail.com",
        sub2Snapshot: sub2User,
        createdAt: new Date("2026-06-29T00:00:00.000Z"),
        updatedAt: new Date("2026-06-29T00:00:00.000Z"),
      },
    ]);

    const result = await unbindQqBotUser({
      db: db as unknown as Parameters<typeof unbindQqBotUser>[0]["db"],
      connectionId: 1,
      qqUserId: "712127095",
    });

    assert.equal(result.binding.qqUserId, "712127095");
    assert.equal(result.binding.sub2Email, "xhc0812320@gmail.com");
    assert.equal(state.length, 0);
  }

  {
    const { db } = createBindingDb();
    await assert.rejects(
      () =>
        unbindQqBotUser({
          db: db as unknown as Parameters<typeof unbindQqBotUser>[0]["db"],
          connectionId: 1,
          qqUserId: "712127095",
        }),
      /当前 QQ 未绑定任何 Sub2 用户/,
    );
  }
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
