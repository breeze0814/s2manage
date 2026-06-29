export type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

export type ListEnvelope<T> = {
  items?: T[];
  data?: T[] | { items?: T[] };
};

type Sub2ApiAccountTestEvent = {
  type?: string;
  text?: string;
  model?: string;
  status?: string;
  code?: string;
  image_url?: string;
  mime_type?: string;
  data?: unknown;
  success?: boolean;
  error?: string;
};

export type Sub2ApiAccountTestResult = {
  success: boolean;
  message: string;
  latency_ms: number;
  model?: string;
  response_text?: string;
  image_count?: number;
  events?: Sub2ApiAccountTestEvent[];
};

export type Sub2ApiAccountModel = {
  id: string;
  type?: string | null;
  display_name?: string | null;
  created_at?: string | null;
};

export type Sub2ApiGroup = {
  id: number;
  name: string;
  description?: string | null;
  platform?: string | null;
  type?: string | null;
  status?: number | string | null;
  rate_multiplier?: number | null;
  is_exclusive?: boolean | null;
  subscription_type?: string | null;
};

export type Sub2ApiDataAccount = {
  id?: number | string | null;
  account_id?: number | string | null;
  accountId?: number | string | null;
  name?: string | null;
  platform?: string | null;
  type?: string | null;
  credentials?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
};

export type Sub2ApiDataPayload = {
  type?: string;
  version?: number;
  exported_at?: string;
  proxies?: unknown[];
  accounts?: Sub2ApiDataAccount[];
};

export type UserRateMultiplierEntry = {
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  rate_multiplier?: number | null;
};

export type Sub2ApiAccountWrite = {
  name?: string;
  notes?: string | null;
  platform?: string;
  type?: string;
  credentials?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  proxy_id?: number | null;
  concurrency?: number;
  priority?: number;
  rate_multiplier?: number;
  load_factor?: number | null;
  status?: string;
  group_ids?: number[];
  expires_at?: number | null;
  auto_pause_on_expired?: boolean;
  confirm_mixed_channel_risk?: boolean;
};

export type Sub2ApiUser = {
  id: number;
  email: string;
  username?: string | null;
  role?: string | null;
  balance?: number | null;
  concurrency?: number | null;
  status?: string | null;
  allowed_groups?: unknown;
  last_active_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  balance_notify_enabled?: boolean | null;
  balance_notify_threshold_type?: string | null;
  balance_notify_threshold?: number | null;
  balance_notify_extra_emails?: string[] | null;
  total_recharged?: number | null;
  rpm_limit?: number | null;
  notes?: string | null;
  last_used_at?: string | null;
  current_concurrency?: number | null;
};

export type Sub2ApiUserSearchInput = {
  page?: number;
  pageSize?: number;
  status?: string;
  role?: string;
  search?: string;
};

export type Sub2ApiUserSearchResult = {
  items: Sub2ApiUser[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type Sub2ApiRedeemCode = {
  id: number;
  code: string;
  type: string;
  value: number;
  status: string;
  used_by?: number | null;
  used_at?: string | null;
  created_at?: string | null;
  group_id?: number | null;
  validity_days?: number;
  notes?: string;
};

export type Sub2ApiRedeemCodeGenerateInput = {
  count: number;
  type: string;
  value: number;
};

export type Sub2ApiGroupWrite = {
  name?: string;
  description?: string;
  platform?: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string;
};
