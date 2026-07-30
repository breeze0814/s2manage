export type UpstreamPlatform = "newapi" | "sub2api";
export type UpstreamRecord = Record<string, unknown>;

export type NewApiSession = {
  readonly platform: "newapi";
  readonly baseUrl: string;
  readonly userId: string;
  readonly cookie?: string;
  readonly accessToken?: string;
  readonly tokenType: string;
  readonly quotaPerUnit: number;
};

export type Sub2ApiSession = {
  readonly platform: "sub2api";
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly adminApiKey?: string;
  readonly expiresAt?: number;
};

export type UpstreamSession = NewApiSession | Sub2ApiSession;

export type CurrentUser = {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly raw: UpstreamRecord;
};

export type UpstreamKey = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly status: string;
  readonly raw: UpstreamRecord;
};

export type AdminGroup = {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly multiplier: number | null;
  readonly raw: UpstreamRecord;
};

export type AdminTarget = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly platform: string;
  readonly status: string;
  readonly priority: number | null;
  readonly weight: number | null;
  readonly concurrency: number | null;
  readonly rateMultiplier: number | null;
  readonly loadFactor: number | null;
  readonly models: string;
  readonly groupIds: readonly string[];
  readonly schedulable: boolean | null;
  readonly baseUrl: string;
};

export type NewApiMetricsPayload = {
  readonly self: UpstreamRecord;
  readonly stat: UpstreamRecord;
  readonly groups: UpstreamRecord;
  readonly pricing: UpstreamRecord;
};

export type Sub2ApiMetricsPayload = {
  readonly self: UpstreamRecord;
  readonly usage: UpstreamRecord;
  readonly availableGroups: readonly UpstreamRecord[];
  readonly groupRates: readonly UpstreamRecord[];
};

export type DateRange = {
  readonly startDate: string;
  readonly endDate: string;
};

export type BalanceFilter = {
  readonly excludeAdmin?: boolean;
  readonly excludeBalances?: readonly number[];
};

export type KeyUsageStat = {
  readonly keyId: string;
  readonly keyName: string;
  readonly groupName: string;
  readonly amount: number;
};

export type Sub2ApiAdminUsersQuery = {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  readonly role?: string;
  readonly search?: string;
  readonly sortBy?: "created_at" | "email" | "username" | "status" | "role" | "total_tokens";
  readonly sortOrder?: "asc" | "desc";
  readonly timezone?: string;
};

export type Sub2ApiUserBreakdownQuery = DateRange & {
  readonly sortBy?: string;
  readonly limit?: number;
  readonly timezone?: string;
};

export type NewApiChannelCreate = {
  readonly name: string;
  readonly baseUrl: string;
  readonly key: string;
  readonly channelType: number;
  readonly groups: readonly string[];
};

export type NewApiChannelState = {
  readonly weight: number;
  readonly status: number;
};

export type Sub2ApiAccountBulkUpdate = {
  readonly priority?: number;
  readonly status?: string;
};

export class UpstreamProtocolError extends Error {
  constructor(message: string, readonly code: "auth" | "invalid_response" | "unsupported") {
    super(message);
  }
}
