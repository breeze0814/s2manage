import { z } from "zod";
import type { EmbedUpstreamGateway } from "./upstream.ts";
import type { Leaderboard, LeaderboardRow } from "./types.ts";

const TIMEZONE = "Asia/Shanghai" as const;
const MAX_ROWS = 50;
const MAX_DAYS = 31;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;

export function createLeaderboardService(input: {
  readonly upstream: Pick<EmbedUpstreamGateway, "userBreakdown">;
  readonly now?: () => Date;
}) {
  return {
    get: async (query: Readonly<{ startDate?: string; endDate?: string }>, currentUserId: string | null = null) => {
      const range = dateRange(query, input.now?.() ?? new Date());
      const payload = await input.upstream.userBreakdown({
        ...range, sortBy: "total_tokens", limit: MAX_ROWS, timezone: TIMEZONE,
      });
      return { ...range, timezone: TIMEZONE, rows: rankedRows(payload), currentUserId } satisfies Leaderboard;
    },
  };
}

function dateRange(query: Readonly<{ startDate?: string; endDate?: string }>, now: Date) {
  const startValue = query.startDate?.trim();
  const endValue = query.endDate?.trim();
  if (!startValue && !endValue) {
    const startDate = shanghaiDate(now);
    return { startDate, endDate: addDays(startDate, 1) };
  }
  const startDate = dateSchema.parse(startValue);
  const endDate = dateSchema.parse(endValue);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days < 1 || days > MAX_DAYS) throw new Error(`排行榜日期范围必须为 1 至 ${MAX_DAYS} 天`);
  return { startDate, endDate };
}

function rankedRows(payload: unknown) {
  return userRecords(payload)
    .map(mapRow)
    .filter((row) => row.userId)
    .sort((left, right) => right.totalTokens - left.totalTokens)
    .slice(0, MAX_ROWS)
    .map((row, index) => ({ ...row, rank: index + 1 } satisfies LeaderboardRow));
}

function userRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  const root = isRecord(payload) ? payload : {};
  if (Array.isArray(root.data)) return root.data.filter(isRecord);
  const data = isRecord(root.data) ? root.data : root;
  const users = Array.isArray(data.users) ? data.users : [];
  return users.filter(isRecord);
}

function mapRow(value: Record<string, unknown>) {
  return {
    rank: 0,
    userId: text(value.user_id ?? value.userId ?? value.id),
    email: maskEmail(text(value.email)),
    requests: integer(value.requests),
    totalTokens: integer(value.total_tokens ?? value.totalTokens),
    actualCost: number(value.actual_cost ?? value.actualCost),
  };
}

function maskEmail(value: string) {
  const separator = value.lastIndexOf("@");
  if (separator < 1) return value ? `${value.slice(0, 1)}***` : "";
  const local = value.slice(0, separator);
  const visible = local.length > 1 ? `${local[0]}***${local.at(-1)}` : `${local[0]}***`;
  return `${visible}${value.slice(separator)}`;
}

function shanghaiDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value);
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("日期无效");
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function text(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function number(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function integer(value: unknown) { return Math.max(0, Math.trunc(number(value))); }
