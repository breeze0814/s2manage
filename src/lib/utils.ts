import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toFixed(12).replace(/\.?0+$/, "") || "0";
}

export function rateTone(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "text-muted-foreground";
  if (numeric <= 1) return "text-emerald-400";
  if (numeric <= 2) return "text-amber-300";
  return "text-rose-400";
}

export function siteTypeLabel(value?: string | null) {
  return value === "new_api" ? "New API" : "Sub2API";
}

export function authModeLabel(value?: string | null) {
  return value === "manual_token" ? "手动 Token" : "自动登录";
}

export function groupTypeLabel(subscriptionType?: string | null, isExclusive?: boolean | number | null) {
  if (isExclusive) return "专属";
  switch (subscriptionType) {
    case "subscription":
      return "订阅";
    case "exclusive":
      return "专属";
    case "user_group":
      return "用户组";
    default:
      return "公开";
  }
}

export function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function isValidBaseUrl(url: string) {
  return /^https?:\/\//i.test(url.trim());
}

export function toDateTimeLocal(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function parseTokenExpire(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = BigInt(raw);
    if (n > 200_000_000_000n) return n / 1000n;
    return n > 1_000_000_000n ? n : BigInt(Math.floor(Date.now() / 1000)) + n;
  }
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : BigInt(Math.floor(timestamp / 1000));
}

export function safeJsonString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  ) as T;
}
