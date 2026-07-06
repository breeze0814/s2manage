import { normalizeRateMultiplier } from "../core/rates.ts";
import type { TargetAccountSnapshot } from "../storage/app-config.ts";

export type Sub2ApiGroup = {
  readonly id: number;
  readonly name: string;
  readonly status?: string | null;
  readonly rate_multiplier?: number | null;
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
