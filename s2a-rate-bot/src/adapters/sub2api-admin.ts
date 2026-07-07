import { normalizeRateMultiplier } from "../core/rates.ts";
import type { TargetAccountSnapshot } from "../storage/app-config.ts";

export type Sub2ApiGroup = {
  readonly id: number;
  readonly name: string;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
};

export type Sub2ApiUser = {
  readonly id: number;
  readonly email: string;
  readonly username?: string | null;
  readonly balance?: number | null;
  readonly last_used_at?: string | null;
};

export type Sub2ApiAffiliateInvite = {
  readonly inviter_id: number;
  readonly inviter_email: string;
  readonly inviter_username?: string | null;
  readonly invitee_id: number;
  readonly invitee_email?: string | null;
  readonly invitee_username?: string | null;
};

export type Sub2ApiListResult<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
  readonly pages: number;
};

export type Sub2ApiRedeemCode = {
  readonly id?: number | null;
  readonly code: string;
  readonly value?: number;
};

type RemoteAccount = Record<string, unknown>;

export class Sub2ApiAdminTarget {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async listGroups() {
    return this.request<Sub2ApiGroup[]>("GET", "/groups/all");
  }

  async updateGroupRateMultiplier(groupId: number, rateMultiplier: number) {
    return this.request<Sub2ApiGroup>("PUT", `/groups/${groupId}`, {
      rate_multiplier: normalizeRateMultiplier(rateMultiplier),
    });
  }

  async listAccounts() {
    const payload = await this.request<unknown>("GET", "/accounts?page=1&page_size=1000");
    return accountList(payload).map(accountSnapshot);
  }

  async setAccountSchedulable(accountId: number, schedulable: boolean) {
    const payload = await this.request<unknown>("POST", `/accounts/${accountId}/schedulable`, { schedulable });
    return accountSnapshot(payload);
  }

  async getSettings() {
    return this.request<Record<string, unknown>>("GET", "/settings");
  }

  async searchUsers(input: { page?: number; pageSize?: number; search?: string } = {}): Promise<Sub2ApiListResult<Sub2ApiUser>> {
    const query = listQuery({
      page: input.page ?? 1,
      page_size: input.pageSize ?? 50,
      status: "",
      role: "",
      search: input.search ?? "",
    });
    return normalizeListResult(await this.request<unknown>("GET", `/users?${query}`), userSnapshot);
  }

  async listAffiliateInvites(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    startAt?: string;
    endAt?: string;
  } = {}): Promise<Sub2ApiListResult<Sub2ApiAffiliateInvite>> {
    const query = listQuery({
      page: input.page ?? 1,
      page_size: input.pageSize ?? 20,
      search: input.search ?? "",
      ...(input.startAt !== undefined ? { start_at: input.startAt } : {}),
      ...(input.endAt !== undefined ? { end_at: input.endAt } : {}),
    });
    return normalizeListResult(await this.request<unknown>("GET", `/affiliates/invites?${query}`), inviteSnapshot);
  }

  async generateRedeemCodes(input: { count: number; type: "balance"; value: number }) {
    const payload = await this.request<unknown>("POST", "/redeem-codes/generate", input);
    return redeemCodeList(payload);
  }

  private adminUrl(path: string) {
    return `${this.baseUrl.replace(/\/+$/, "")}/api/v1/admin${path}`;
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.adminUrl(path), {
        method,
        signal: controller.signal,
        headers: {
          "x-api-key": this.apiKey,
          "content-type": "application/json; charset=utf-8",
          accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Sub2API HTTP ${response.status}: ${text.slice(0, 300)}`);
      if (!text.trim()) return [] as T;
      return unwrapEnvelope<T>(JSON.parse(text));
    } finally {
      clearTimeout(timer);
    }
  }
}

function unwrapEnvelope<T>(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (record && "data" in record) return record.data as T;
  return value as T;
}

function accountList(value: unknown) {
  if (Array.isArray(value)) return value as RemoteAccount[];
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (Array.isArray(record.items)) return record.items as RemoteAccount[];
  const data = record.data;
  if (Array.isArray(data)) return data as RemoteAccount[];
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).items)) {
    return (data as Record<string, unknown>).items as RemoteAccount[];
  }
  return [];
}

function listQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

function normalizeListResult<T>(value: unknown, mapItem: (item: unknown) => T): Sub2ApiListResult<T> {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const items = Array.isArray(record.items) ? record.items : Array.isArray(value) ? value : [];
  return {
    items: items.map(mapItem),
    total: nullableInt(record.total) ?? items.length,
    page: nullableInt(record.page) ?? 1,
    page_size: nullableInt(record.page_size ?? record.pageSize) ?? items.length,
    pages: nullableInt(record.pages) ?? 1,
  };
}

function redeemCodeList(value: unknown) {
  const items = Array.isArray(value) ? value : accountList(value);
  return items.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: nullableInt(row.id),
      code: text(row.code),
      value: nullableNumber(row.value) ?? undefined,
    } satisfies Sub2ApiRedeemCode;
  }).filter((item) => item.code);
}

function userSnapshot(value: unknown): Sub2ApiUser {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: positiveInt(row.id),
    email: text(row.email),
    username: optionalText(row.username),
    balance: nullableNumber(row.balance),
    last_used_at: optionalText(row.last_used_at ?? row.lastUsedAt),
  };
}

function inviteSnapshot(value: unknown): Sub2ApiAffiliateInvite {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    inviter_id: positiveInt(row.inviter_id ?? row.inviterId),
    inviter_email: text(row.inviter_email ?? row.inviterEmail),
    inviter_username: optionalText(row.inviter_username ?? row.inviterUsername),
    invitee_id: positiveInt(row.invitee_id ?? row.inviteeId),
    invitee_email: optionalText(row.invitee_email ?? row.inviteeEmail),
    invitee_username: optionalText(row.invitee_username ?? row.inviteeUsername),
  };
}

function accountSnapshot(account: unknown): TargetAccountSnapshot {
  const row = account && typeof account === "object" ? account as RemoteAccount : {};
  const id = positiveInt(row.id ?? row.account_id ?? row.accountId);
  return {
    id,
    name: text(row.name ?? row.username) || `#${id}`,
    platform: text(row.platform) || "-",
    status: text(row.status) || "active",
    schedulable: row.schedulable !== false,
    rateMultiplier: nullableNumber(row.rate_multiplier ?? row.rateMultiplier),
    priority: nullableInt(row.priority),
    groupIds: groupIds(row),
  };
}

function groupIds(row: RemoteAccount) {
  const ids = [
    ...arrayIds(row.group_ids),
    ...arrayObjectIds(row.groups, "id"),
    ...accountGroupIds(row.account_groups),
    ...arrayIds([row.group_id]),
  ];
  return Array.from(new Set(ids));
}

function accountGroupIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item as RemoteAccount : {};
    const group = row.group && typeof row.group === "object" ? row.group as RemoteAccount : {};
    return positiveIntOrNull(row.group_id ?? row.groupId ?? group.id);
  }).filter((id): id is number => Boolean(id));
}

function arrayObjectIds(value: unknown, key: string) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => item && typeof item === "object" ? positiveIntOrNull((item as RemoteAccount)[key]) : null)
    .filter((id): id is number => Boolean(id));
}

function arrayIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(positiveIntOrNull).filter((id): id is number => Boolean(id));
}

function positiveInt(value: unknown) {
  const id = positiveIntOrNull(value);
  if (!id) throw new Error(`Invalid account id: ${String(value)}`);
  return id;
}

function positiveIntOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function nullableInt(value: unknown) {
  const numeric = nullableNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const result = text(value);
  return result ? result : undefined;
}
