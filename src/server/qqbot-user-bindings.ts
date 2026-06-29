import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Sub2ApiAdminClient, Sub2ApiUser } from "@/server/clients/sub2api-admin";
import { extractQqBotCommandText } from "@/server/qqbot-command";

type QqBotUserBindingRow = Awaited<ReturnType<PrismaClient["qqBotUserBinding"]["findUnique"]>>;

export type QqBotUserBindingSnapshot = Prisma.InputJsonObject;

export type QqBotUserBindingResult = {
  binding: {
    id: number;
    connectionId: number;
    qqUserId: string;
    sub2UserId: number;
    sub2Email: string;
    sub2Snapshot: QqBotUserBindingSnapshot;
  };
};

const SEARCH_PAGE = 1;
const SEARCH_PAGE_SIZE = 50;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeQqUserId(qqUserId: string) {
  return qqUserId.trim();
}

function normalizeJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item)) as Prisma.InputJsonArray;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, normalizeJsonValue(entry)])) as Prisma.InputJsonObject;
  }
  return null;
}

function toSnapshot(user: Sub2ApiUser): QqBotUserBindingSnapshot {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    role: user.role ?? null,
    balance: user.balance ?? null,
    concurrency: user.concurrency ?? null,
    status: user.status ?? null,
    allowed_groups: normalizeJsonValue(user.allowed_groups),
    last_active_at: user.last_active_at ?? null,
    created_at: user.created_at ?? null,
    updated_at: user.updated_at ?? null,
    balance_notify_enabled: user.balance_notify_enabled ?? null,
    balance_notify_threshold_type: user.balance_notify_threshold_type ?? null,
    balance_notify_threshold: user.balance_notify_threshold ?? null,
    balance_notify_extra_emails: normalizeJsonValue(user.balance_notify_extra_emails) as Prisma.InputJsonArray | null,
    total_recharged: user.total_recharged ?? null,
    rpm_limit: user.rpm_limit ?? null,
    notes: user.notes ?? null,
    last_used_at: user.last_used_at ?? null,
    current_concurrency: user.current_concurrency ?? null,
  };
}

function pickMatchedUser(items: Sub2ApiUser[], email: string) {
  const normalized = normalizeEmail(email);
  const matches = items.filter((item) => normalizeEmail(item.email) === normalized);
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

function buildBindingShape(connectionId: number, qqUserId: string, user: Sub2ApiUser) {
  return {
    connectionId,
    qqUserId,
    sub2UserId: user.id,
    sub2Email: user.email,
    sub2Snapshot: toSnapshot(user),
  };
}

function ensureSingleMatch(items: Sub2ApiUser[], email: string) {
  const matched = pickMatchedUser(items, email);
  if (!matched) throw new Error("未找到唯一匹配的 Sub2 用户");
  return matched;
}

export function resolveQqBotUserBindingCommandDecision(input: {
  settings: { enabled: boolean };
  botUserId: string;
  message: { messageType: string; subType: string; groupId: string; userId: string; text: string };
}) {
  if (!input.settings.enabled) return { action: "skip" as const, reason: "QQBot 未启用" };
  const botUserId = input.botUserId.trim();
  if (!botUserId) return { action: "skip" as const, reason: "未获取当前 Bot QQ，无法判断 @ 消息" };

  const commandText = extractQqBotCommandText(input.message.text, botUserId);
  if (commandText === null) return { action: "skip" as const, reason: `消息未以 @ 当前 Bot QQ ${botUserId} 作为前缀` };

  if (commandText.startsWith("绑定")) {
    const bindMatch = /^绑定\s+(.+)$/u.exec(commandText);
    if (!bindMatch) return { action: "invalid-bind" as const, reason: "绑定指令格式应为：绑定 xxxx@qq.com" };
    const email = bindMatch[1]?.trim() ?? "";
    if (!email) return { action: "invalid-bind" as const, reason: "绑定指令格式应为：绑定 xxxx@qq.com" };
    return { action: "bind-user" as const, email };
  }

  if (commandText === "解绑") {
    return { action: "unbind-user" as const };
  }

  return { action: "skip" as const, reason: "未匹配到 QQBot 绑定指令" };
}

export async function bindQqBotUser(input: {
  db: Pick<PrismaClient, "qqBotUserBinding" | "$transaction">;
  connectionId: number;
  qqUserId: string;
  email: string;
  sub2Client: Pick<Sub2ApiAdminClient, "searchUsers">;
}) {
  const qqUserId = normalizeQqUserId(input.qqUserId);
  const email = normalizeEmail(input.email);
  const searchResult = await input.sub2Client.searchUsers({
    page: SEARCH_PAGE,
    pageSize: SEARCH_PAGE_SIZE,
    search: email,
  });
  const user = ensureSingleMatch(searchResult.items, email);
  const binding = buildBindingShape(input.connectionId, qqUserId, user);

  return await input.db.$transaction(async (tx) => {
    const existingQq = await tx.qqBotUserBinding.findUnique({
      where: { connectionId_qqUserId: { connectionId: input.connectionId, qqUserId } },
    });
    if (existingQq && existingQq.sub2UserId !== user.id) throw new Error("当前 QQ 已绑定其他 Sub2 用户");

    const existingSub2 = await tx.qqBotUserBinding.findUnique({
      where: { connectionId_sub2UserId: { connectionId: input.connectionId, sub2UserId: user.id } },
    });
    if (existingSub2 && existingSub2.qqUserId !== qqUserId) throw new Error("该 Sub2 用户已绑定其他 QQ");

    const row = await tx.qqBotUserBinding.upsert({
      where: { connectionId_qqUserId: { connectionId: input.connectionId, qqUserId } },
      create: binding,
      update: {
        sub2UserId: user.id,
        sub2Email: user.email,
        sub2Snapshot: toSnapshot(user),
      },
    });

    return { binding: normalizeBindingRow(row) };
  });
}

export async function unbindQqBotUser(input: {
  db: Pick<PrismaClient, "qqBotUserBinding" | "$transaction">;
  connectionId: number;
  qqUserId: string;
}) {
  const qqUserId = normalizeQqUserId(input.qqUserId);
  const existing = await input.db.qqBotUserBinding.findUnique({
    where: { connectionId_qqUserId: { connectionId: input.connectionId, qqUserId } },
  });
  if (!existing) throw new Error("当前 QQ 未绑定任何 Sub2 用户");

  const row = await input.db.qqBotUserBinding.delete({
    where: { connectionId_qqUserId: { connectionId: input.connectionId, qqUserId } },
  });
  return { binding: normalizeBindingRow(row) };
}

function normalizeBindingRow(row: NonNullable<QqBotUserBindingRow>) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    qqUserId: row.qqUserId,
    sub2UserId: row.sub2UserId,
    sub2Email: row.sub2Email,
    sub2Snapshot: row.sub2Snapshot as QqBotUserBindingSnapshot,
  };
}
