import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { writeSyncLog } from "@/server/sync-logs";
import { decrypt } from "@/server/crypto";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";

async function getClient(connectionId: number) {
  const conn = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  return new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
}

async function logSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  await writeSyncLog(db, { connectionId, action, target, detail, status, error });
}

async function safeLogSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await logSync(connectionId, action, target, detail, status, error);
  } catch {
    // Logging must not hide the remote operation result.
  }
}

const authSources = ["email", "linuxdo", "oidc", "wechat", "github", "google", "dingtalk"];

const booleanSettingKeys = new Set([
  "registration_enabled",
  "email_verify_enabled",
  "promo_code_enabled",
  "password_reset_enabled",
  "invitation_code_enabled",
  "totp_enabled",
  "login_agreement_enabled",
  "force_email_on_third_party_signup",
  "hide_ccs_import_button",
  "backend_mode_enabled",
  "smtp_use_tls",
  "turnstile_enabled",
  "api_key_acl_trust_forwarded_ip",
  "linuxdo_connect_enabled",
  "dingtalk_connect_enabled",
  "dingtalk_connect_bypass_registration",
  "dingtalk_connect_sync_corp_email",
  "dingtalk_connect_sync_display_name",
  "dingtalk_connect_sync_dept",
  "wechat_connect_enabled",
  "wechat_connect_open_enabled",
  "wechat_connect_mp_enabled",
  "wechat_connect_mobile_enabled",
  "oidc_connect_enabled",
  "oidc_connect_use_pkce",
  "oidc_connect_validate_id_token",
  "oidc_connect_require_email_verified",
  "github_oauth_enabled",
  "google_oauth_enabled",
  "enable_model_fallback",
  "enable_identity_patch",
  "ops_monitoring_enabled",
  "ops_realtime_monitoring_enabled",
  "allow_ungrouped_key_scheduling",
  "enable_fingerprint_unification",
  "enable_metadata_passthrough",
  "enable_cch_signing",
  "enable_anthropic_cache_ttl_1h_injection",
  "rewrite_message_cache_control",
  "openai_allow_claude_code_codex_plugin",
  "payment_enabled",
  "risk_control_enabled",
  "payment_balance_disabled",
  "payment_cancel_rate_limit_enabled",
  "payment_alipay_force_qrcode",
  "payment_visible_method_alipay_enabled",
  "payment_visible_method_wxpay_enabled",
  "openai_advanced_scheduler_enabled",
  "balance_low_notify_enabled",
  "subscription_expiry_notify_enabled",
  "account_quota_notify_enabled",
  "channel_monitor_enabled",
  "available_channels_enabled",
  "affiliate_enabled",
  "allow_user_view_error_requests",
]);

for (const source of authSources) {
  booleanSettingKeys.add(`auth_source_default_${source}_grant_on_signup`);
  booleanSettingKeys.add(`auth_source_default_${source}_grant_on_first_bind`);
}

const numberSettingKeys = new Set([
  "default_balance",
  "affiliate_rebate_rate",
  "affiliate_rebate_freeze_hours",
  "affiliate_rebate_duration_days",
  "affiliate_rebate_per_invitee_cap",
  "default_concurrency",
  "default_user_rpm_limit",
  "table_default_page_size",
  "smtp_port",
  "oidc_connect_clock_skew_seconds",
  "ops_metrics_interval_seconds",
  "payment_min_amount",
  "payment_max_amount",
  "payment_daily_limit",
  "payment_order_timeout_minutes",
  "payment_max_pending_orders",
  "payment_balance_recharge_multiplier",
  "payment_recharge_fee_rate",
  "payment_cancel_rate_limit_max",
  "payment_cancel_rate_limit_window",
  "balance_low_notify_threshold",
  "channel_monitor_default_interval_seconds",
]);

for (const source of authSources) {
  numberSettingKeys.add(`auth_source_default_${source}_balance`);
  numberSettingKeys.add(`auth_source_default_${source}_concurrency`);
}

const stringArraySettingKeys = new Set([
  "registration_email_suffix_whitelist",
  "payment_enabled_types",
]);

const numberArraySettingKeys = new Set(["table_page_size_options"]);

const jsonSettingKeys = new Set([
  "login_agreement_documents",
  "custom_menu_items",
  "custom_endpoints",
  "default_subscriptions",
  "default_platform_quotas",
  "account_quota_notify_emails",
  "openai_fast_policy_settings",
]);

for (const source of authSources) {
  jsonSettingKeys.add(`auth_source_default_${source}_subscriptions`);
  jsonSettingKeys.add(`auth_source_default_${source}_platform_quotas`);
}

const secretSettingKeys = new Set([
  "smtp_password",
  "turnstile_secret_key",
  "linuxdo_connect_client_secret",
  "dingtalk_connect_client_secret",
  "wechat_connect_app_secret",
  "wechat_connect_open_app_secret",
  "wechat_connect_mp_app_secret",
  "wechat_connect_mobile_app_secret",
  "oidc_connect_client_secret",
  "github_oauth_client_secret",
  "google_oauth_client_secret",
]);

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function parseStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function parseNumberList(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  return values
    .map((item) => Number(String(item).trim()))
    .filter((item) => Number.isFinite(item));
}

function parseJsonSetting(key: string, value: unknown) {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) {
    if (key.endsWith("_subscriptions") || key === "login_agreement_documents" || key === "custom_menu_items" || key === "custom_endpoints" || key === "account_quota_notify_emails") {
      return [];
    }
    if (key === "openai_fast_policy_settings") return { rules: [] };
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function normalizeSettingsPayload(settings: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;

    if (secretSettingKeys.has(key)) {
      const secret = typeof value === "string" ? value.trim() : String(value).trim();
      if (secret) payload[key] = secret;
      continue;
    }

    if (booleanSettingKeys.has(key)) {
      payload[key] = parseBoolean(value);
    } else if (numberSettingKeys.has(key)) {
      payload[key] = parseNumber(value);
    } else if (stringArraySettingKeys.has(key)) {
      payload[key] = parseStringList(value);
    } else if (numberArraySettingKeys.has(key)) {
      payload[key] = parseNumberList(value);
    } else if (jsonSettingKeys.has(key)) {
      payload[key] = parseJsonSetting(key, value);
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

export const siteSettingsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = await getClient(input.connectionId);
      return client.getSettings();
    }),
  update: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), settings: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input }) => {
      const client = await getClient(input.connectionId);
      const detail = { keys: Object.keys(input.settings) };
      try {
        const payload = normalizeSettingsPayload(input.settings);
        await client.updateSettings(payload);
        await safeLogSync(input.connectionId, "update_site_settings", "", detail, "success");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await safeLogSync(input.connectionId, "update_site_settings", "", detail, "failed", message);
        throw error;
      }
    }),
});
