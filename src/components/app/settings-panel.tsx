"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type FieldKind = "text" | "secret" | "textarea" | "number" | "boolean" | "select" | "stringList" | "numberList" | "json";
type FormValue = string | boolean;

type SettingField = {
  key: string;
  label: string;
  kind: FieldKind;
  description?: string;
  placeholder?: string;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
  configuredKey?: string;
  jsonDefault?: unknown;
};

type SettingSection = {
  key: string;
  label: string;
  description: string;
  fields: SettingField[];
};

const authSources = [
  { key: "email", label: "邮箱" },
  { key: "linuxdo", label: "LinuxDo" },
  { key: "oidc", label: "OIDC" },
  { key: "wechat", label: "微信" },
  { key: "github", label: "GitHub" },
  { key: "google", label: "Google" },
  { key: "dingtalk", label: "钉钉" },
];

function authSourceFields() {
  return authSources.flatMap<SettingField>((source) => [
    { key: `auth_source_default_${source.key}_balance`, label: `${source.label}默认余额`, kind: "number" },
    { key: `auth_source_default_${source.key}_concurrency`, label: `${source.label}默认并发`, kind: "number" },
    { key: `auth_source_default_${source.key}_grant_on_signup`, label: `${source.label}注册时发放`, kind: "boolean" },
    { key: `auth_source_default_${source.key}_grant_on_first_bind`, label: `${source.label}首次绑定时发放`, kind: "boolean" },
    { key: `auth_source_default_${source.key}_subscriptions`, label: `${source.label}默认订阅 JSON`, kind: "json", rows: 4, jsonDefault: [] },
    { key: `auth_source_default_${source.key}_platform_quotas`, label: `${source.label}平台额度 JSON`, kind: "json", rows: 4, jsonDefault: {} },
  ]);
}

const settingSections: SettingSection[] = [
  {
    key: "site",
    label: "站点",
    description: "站点品牌、首页展示、后台模式和列表偏好。",
    fields: [
      { key: "site_name", label: "站点名称", kind: "text" },
      { key: "site_subtitle", label: "站点副标题", kind: "text" },
      { key: "site_logo", label: "站点 Logo", kind: "text", placeholder: "https://..." },
      { key: "api_base_url", label: "API Base URL", kind: "text", placeholder: "https://api.example.com" },
      { key: "contact_info", label: "联系方式", kind: "text" },
      { key: "doc_url", label: "文档地址", kind: "text", placeholder: "https://..." },
      { key: "home_content", label: "首页内容", kind: "textarea", rows: 6 },
      { key: "footer_content", label: "页脚内容", kind: "textarea", rows: 4 },
      { key: "backend_mode_enabled", label: "后台模式", kind: "boolean", description: "开启后偏向仅管理员使用。" },
      { key: "hide_ccs_import_button", label: "隐藏 CCS 导入按钮", kind: "boolean" },
      { key: "allow_user_view_error_requests", label: "允许用户查看失败请求", kind: "boolean" },
      { key: "table_default_page_size", label: "表格默认分页数", kind: "number" },
      { key: "table_page_size_options", label: "分页选项", kind: "numberList", placeholder: "10,20,50,100" },
      { key: "custom_endpoints", label: "自定义端点 JSON", kind: "json", rows: 5, jsonDefault: [] },
      { key: "custom_menu_items", label: "自定义菜单 JSON", kind: "json", rows: 5, jsonDefault: [] },
    ],
  },
  {
    key: "registration",
    label: "注册安全",
    description: "注册、邮箱验证、登录协议、TOTP、Turnstile 和 API Key IP 识别。",
    fields: [
      { key: "registration_enabled", label: "允许注册", kind: "boolean" },
      { key: "email_verify_enabled", label: "启用邮箱验证", kind: "boolean" },
      { key: "registration_email_suffix_whitelist", label: "邮箱后缀白名单", kind: "stringList", placeholder: "example.com\ncompany.com" },
      { key: "force_email_on_third_party_signup", label: "第三方注册强制绑定邮箱", kind: "boolean" },
      { key: "promo_code_enabled", label: "启用优惠码", kind: "boolean" },
      { key: "invitation_code_enabled", label: "启用邀请码", kind: "boolean" },
      { key: "password_reset_enabled", label: "启用密码重置", kind: "boolean" },
      { key: "frontend_url", label: "前端 URL", kind: "text", placeholder: "https://your-domain.com" },
      { key: "totp_enabled", label: "启用 TOTP 双因素", kind: "boolean", configuredKey: "totp_encryption_key_configured" },
      {
        key: "login_agreement_enabled",
        label: "启用登录协议",
        kind: "boolean",
      },
      {
        key: "login_agreement_mode",
        label: "登录协议模式",
        kind: "select",
        options: [
          { value: "modal", label: "弹窗" },
          { value: "checkbox", label: "勾选框" },
        ],
      },
      { key: "login_agreement_updated_at", label: "登录协议更新时间", kind: "text", placeholder: "2026-06-14T00:00:00Z" },
      { key: "login_agreement_documents", label: "登录协议文档 JSON", kind: "json", rows: 6, jsonDefault: [] },
      { key: "api_key_acl_trust_forwarded_ip", label: "API Key ACL 信任转发 IP", kind: "boolean" },
      { key: "turnstile_enabled", label: "启用 Cloudflare Turnstile", kind: "boolean" },
      { key: "turnstile_site_key", label: "Turnstile Site Key", kind: "text" },
      { key: "turnstile_secret_key", label: "Turnstile Secret Key", kind: "secret", configuredKey: "turnstile_secret_key_configured" },
    ],
  },
  {
    key: "defaults",
    label: "默认额度",
    description: "新用户默认余额、并发、RPM、订阅和不同登录来源的默认发放策略。",
    fields: [
      { key: "default_balance", label: "默认余额", kind: "number" },
      { key: "default_concurrency", label: "默认并发", kind: "number" },
      { key: "default_user_rpm_limit", label: "默认用户 RPM 限制", kind: "number" },
      { key: "default_subscriptions", label: "默认订阅 JSON", kind: "json", rows: 5, jsonDefault: [] },
      { key: "default_platform_quotas", label: "默认平台额度 JSON", kind: "json", rows: 5, jsonDefault: {} },
      ...authSourceFields(),
    ],
  },
  {
    key: "mail",
    label: "邮件通知",
    description: "SMTP、余额不足提醒、订阅到期提醒和账号额度通知。",
    fields: [
      { key: "smtp_host", label: "SMTP Host", kind: "text" },
      { key: "smtp_port", label: "SMTP Port", kind: "number" },
      { key: "smtp_username", label: "SMTP 用户名", kind: "text" },
      { key: "smtp_password", label: "SMTP 密码", kind: "secret", configuredKey: "smtp_password_configured" },
      { key: "smtp_from_email", label: "发件邮箱", kind: "text" },
      { key: "smtp_from_name", label: "发件名称", kind: "text" },
      { key: "smtp_use_tls", label: "SMTP 使用 TLS", kind: "boolean" },
      { key: "balance_low_notify_enabled", label: "余额不足提醒", kind: "boolean" },
      { key: "balance_low_notify_threshold", label: "余额不足阈值", kind: "number" },
      { key: "balance_low_notify_recharge_url", label: "充值链接", kind: "text" },
      { key: "subscription_expiry_notify_enabled", label: "订阅到期提醒", kind: "boolean" },
      { key: "account_quota_notify_enabled", label: "账号额度通知", kind: "boolean" },
      { key: "account_quota_notify_emails", label: "账号额度通知邮箱 JSON", kind: "json", rows: 5, jsonDefault: [] },
    ],
  },
  {
    key: "oauth",
    label: "OAuth",
    description: "LinuxDo、GitHub、Google、微信、钉钉和通用 OIDC 登录配置。",
    fields: [
      { key: "linuxdo_connect_enabled", label: "启用 LinuxDo 登录", kind: "boolean" },
      { key: "linuxdo_connect_client_id", label: "LinuxDo Client ID", kind: "text" },
      { key: "linuxdo_connect_client_secret", label: "LinuxDo Client Secret", kind: "secret", configuredKey: "linuxdo_connect_client_secret_configured" },
      { key: "linuxdo_connect_redirect_url", label: "LinuxDo Redirect URL", kind: "text" },
      { key: "github_oauth_enabled", label: "启用 GitHub OAuth", kind: "boolean" },
      { key: "github_oauth_client_id", label: "GitHub Client ID", kind: "text" },
      { key: "github_oauth_client_secret", label: "GitHub Client Secret", kind: "secret", configuredKey: "github_oauth_client_secret_configured" },
      { key: "github_oauth_redirect_url", label: "GitHub 后端回调", kind: "text" },
      { key: "github_oauth_frontend_redirect_url", label: "GitHub 前端回调", kind: "text" },
      { key: "google_oauth_enabled", label: "启用 Google OAuth", kind: "boolean" },
      { key: "google_oauth_client_id", label: "Google Client ID", kind: "text" },
      { key: "google_oauth_client_secret", label: "Google Client Secret", kind: "secret", configuredKey: "google_oauth_client_secret_configured" },
      { key: "google_oauth_redirect_url", label: "Google 后端回调", kind: "text" },
      { key: "google_oauth_frontend_redirect_url", label: "Google 前端回调", kind: "text" },
      { key: "wechat_connect_enabled", label: "启用微信登录", kind: "boolean" },
      { key: "wechat_connect_open_enabled", label: "微信开放平台", kind: "boolean" },
      { key: "wechat_connect_mp_enabled", label: "微信公众号", kind: "boolean" },
      { key: "wechat_connect_mobile_enabled", label: "微信移动应用", kind: "boolean" },
      { key: "wechat_connect_open_app_id", label: "微信开放平台 App ID", kind: "text" },
      { key: "wechat_connect_open_app_secret", label: "微信开放平台 App Secret", kind: "secret", configuredKey: "wechat_connect_open_app_secret_configured" },
      { key: "wechat_connect_mp_app_id", label: "微信公众号 App ID", kind: "text" },
      { key: "wechat_connect_mp_app_secret", label: "微信公众号 App Secret", kind: "secret", configuredKey: "wechat_connect_mp_app_secret_configured" },
      { key: "wechat_connect_mobile_app_id", label: "微信移动应用 App ID", kind: "text" },
      { key: "wechat_connect_mobile_app_secret", label: "微信移动应用 App Secret", kind: "secret", configuredKey: "wechat_connect_mobile_app_secret_configured" },
      { key: "wechat_connect_redirect_url", label: "微信后端回调", kind: "text" },
      { key: "wechat_connect_frontend_redirect_url", label: "微信前端回调", kind: "text" },
      { key: "dingtalk_connect_enabled", label: "启用钉钉登录", kind: "boolean" },
      { key: "dingtalk_connect_client_id", label: "钉钉 Client ID", kind: "text" },
      { key: "dingtalk_connect_client_secret", label: "钉钉 Client Secret", kind: "secret", configuredKey: "dingtalk_connect_client_secret_configured" },
      { key: "dingtalk_connect_redirect_url", label: "钉钉 Redirect URL", kind: "text" },
      {
        key: "dingtalk_connect_corp_restriction_policy",
        label: "钉钉企业限制",
        kind: "select",
        options: [
          { value: "none", label: "不限制" },
          { value: "internal_only", label: "仅内部企业" },
          { value: "reject_internal", label: "拒绝内部企业" },
        ],
      },
      { key: "dingtalk_connect_internal_corp_id", label: "钉钉内部 Corp ID", kind: "text" },
      { key: "dingtalk_connect_bypass_registration", label: "钉钉绕过注册开关", kind: "boolean" },
      { key: "dingtalk_connect_sync_corp_email", label: "同步钉钉企业邮箱", kind: "boolean" },
      { key: "dingtalk_connect_sync_display_name", label: "同步钉钉显示名", kind: "boolean" },
      { key: "dingtalk_connect_sync_dept", label: "同步钉钉部门", kind: "boolean" },
      { key: "dingtalk_connect_sync_corp_email_attr_key", label: "企业邮箱属性 Key", kind: "text" },
      { key: "dingtalk_connect_sync_display_name_attr_key", label: "显示名属性 Key", kind: "text" },
      { key: "dingtalk_connect_sync_dept_attr_key", label: "部门属性 Key", kind: "text" },
      { key: "dingtalk_connect_sync_corp_email_attr_name", label: "企业邮箱属性名", kind: "text" },
      { key: "dingtalk_connect_sync_display_name_attr_name", label: "显示名属性名", kind: "text" },
      { key: "dingtalk_connect_sync_dept_attr_name", label: "部门属性名", kind: "text" },
      { key: "oidc_connect_enabled", label: "启用 OIDC", kind: "boolean" },
      { key: "oidc_connect_provider_name", label: "OIDC 提供方名称", kind: "text" },
      { key: "oidc_connect_client_id", label: "OIDC Client ID", kind: "text" },
      { key: "oidc_connect_client_secret", label: "OIDC Client Secret", kind: "secret", configuredKey: "oidc_connect_client_secret_configured" },
      { key: "oidc_connect_issuer_url", label: "OIDC Issuer URL", kind: "text" },
      { key: "oidc_connect_discovery_url", label: "OIDC Discovery URL", kind: "text" },
      { key: "oidc_connect_authorize_url", label: "OIDC Authorize URL", kind: "text" },
      { key: "oidc_connect_token_url", label: "OIDC Token URL", kind: "text" },
      { key: "oidc_connect_userinfo_url", label: "OIDC UserInfo URL", kind: "text" },
      { key: "oidc_connect_jwks_url", label: "OIDC JWKS URL", kind: "text" },
      { key: "oidc_connect_scopes", label: "OIDC Scopes", kind: "text", placeholder: "openid email profile" },
      { key: "oidc_connect_redirect_url", label: "OIDC 后端回调", kind: "text" },
      { key: "oidc_connect_frontend_redirect_url", label: "OIDC 前端回调", kind: "text" },
      {
        key: "oidc_connect_token_auth_method",
        label: "OIDC Token Auth Method",
        kind: "select",
        options: [
          { value: "client_secret_basic", label: "client_secret_basic" },
          { value: "client_secret_post", label: "client_secret_post" },
          { value: "none", label: "none" },
        ],
      },
      { key: "oidc_connect_use_pkce", label: "OIDC 使用 PKCE", kind: "boolean" },
      { key: "oidc_connect_validate_id_token", label: "验证 ID Token", kind: "boolean" },
      { key: "oidc_connect_allowed_signing_algs", label: "允许签名算法", kind: "text", placeholder: "RS256,ES256" },
      { key: "oidc_connect_clock_skew_seconds", label: "时钟偏移秒数", kind: "number" },
      { key: "oidc_connect_require_email_verified", label: "要求邮箱已验证", kind: "boolean" },
      { key: "oidc_connect_userinfo_email_path", label: "UserInfo 邮箱路径", kind: "text" },
      { key: "oidc_connect_userinfo_id_path", label: "UserInfo ID 路径", kind: "text" },
      { key: "oidc_connect_userinfo_username_path", label: "UserInfo 用户名路径", kind: "text" },
    ],
  },
  {
    key: "gateway",
    label: "网关调度",
    description: "模型回退、身份补丁、分组调度、Claude Code 和上游转发行为。",
    fields: [
      { key: "enable_model_fallback", label: "启用模型回退", kind: "boolean" },
      { key: "fallback_model_anthropic", label: "Anthropic 回退模型", kind: "text" },
      { key: "fallback_model_openai", label: "OpenAI 回退模型", kind: "text" },
      { key: "fallback_model_gemini", label: "Gemini 回退模型", kind: "text" },
      { key: "fallback_model_antigravity", label: "Antigravity 回退模型", kind: "text" },
      { key: "enable_identity_patch", label: "启用身份补丁", kind: "boolean" },
      { key: "identity_patch_prompt", label: "身份补丁 Prompt", kind: "textarea", rows: 5 },
      { key: "min_claude_code_version", label: "Claude Code 最低版本", kind: "text" },
      { key: "max_claude_code_version", label: "Claude Code 最高版本", kind: "text" },
      { key: "allow_ungrouped_key_scheduling", label: "允许未分组 Key 调度", kind: "boolean" },
      { key: "openai_advanced_scheduler_enabled", label: "OpenAI 高级调度", kind: "boolean" },
      { key: "enable_fingerprint_unification", label: "统一 OAuth 指纹", kind: "boolean" },
      { key: "enable_metadata_passthrough", label: "透传 metadata", kind: "boolean" },
      { key: "enable_cch_signing", label: "启用 CCH 签名", kind: "boolean" },
      { key: "enable_anthropic_cache_ttl_1h_injection", label: "注入 Anthropic 1h Cache TTL", kind: "boolean" },
      { key: "rewrite_message_cache_control", label: "改写 message cache_control", kind: "boolean" },
      { key: "antigravity_user_agent_version", label: "Antigravity UA 版本", kind: "text" },
      { key: "openai_codex_user_agent", label: "OpenAI Codex User-Agent", kind: "textarea", rows: 3 },
      { key: "openai_allow_claude_code_codex_plugin", label: "允许 Claude Code Codex 插件", kind: "boolean" },
      { key: "openai_fast_policy_settings", label: "OpenAI Fast/Flex 策略 JSON", kind: "json", rows: 6, jsonDefault: { rules: [] } },
    ],
  },
  {
    key: "ops",
    label: "运营支付",
    description: "监控、可用渠道、风控、邀请返利和支付配置。",
    fields: [
      { key: "ops_monitoring_enabled", label: "启用 Ops 监控", kind: "boolean" },
      { key: "ops_realtime_monitoring_enabled", label: "启用实时监控", kind: "boolean" },
      {
        key: "ops_query_mode_default",
        label: "Ops 查询模式",
        kind: "select",
        options: [
          { value: "auto", label: "auto" },
          { value: "raw", label: "raw" },
          { value: "preagg", label: "preagg" },
        ],
      },
      { key: "ops_metrics_interval_seconds", label: "指标采集间隔秒数", kind: "number" },
      { key: "channel_monitor_enabled", label: "启用渠道监控", kind: "boolean" },
      { key: "channel_monitor_default_interval_seconds", label: "渠道监控默认间隔秒数", kind: "number" },
      { key: "available_channels_enabled", label: "启用可用渠道页", kind: "boolean" },
      { key: "risk_control_enabled", label: "启用风控中心", kind: "boolean" },
      { key: "affiliate_enabled", label: "启用邀请返利", kind: "boolean" },
      { key: "affiliate_rebate_rate", label: "返利比例", kind: "number" },
      { key: "affiliate_rebate_freeze_hours", label: "返利冻结小时", kind: "number" },
      { key: "affiliate_rebate_duration_days", label: "返利有效天数", kind: "number" },
      { key: "affiliate_rebate_per_invitee_cap", label: "单被邀请人返利上限", kind: "number" },
      { key: "payment_enabled", label: "启用支付", kind: "boolean" },
      { key: "payment_min_amount", label: "最小支付金额", kind: "number" },
      { key: "payment_max_amount", label: "最大支付金额", kind: "number" },
      { key: "payment_daily_limit", label: "每日支付限额", kind: "number" },
      { key: "payment_order_timeout_minutes", label: "订单超时分钟", kind: "number" },
      { key: "payment_max_pending_orders", label: "最大待支付订单数", kind: "number" },
      { key: "payment_enabled_types", label: "启用支付类型", kind: "stringList", placeholder: "alipay\nwxpay\nstripe" },
      { key: "payment_balance_disabled", label: "禁用余额支付", kind: "boolean" },
      { key: "payment_balance_recharge_multiplier", label: "余额充值倍率", kind: "number" },
      { key: "payment_recharge_fee_rate", label: "充值手续费率", kind: "number" },
      { key: "payment_load_balance_strategy", label: "支付负载策略", kind: "text", placeholder: "round_robin / least_amount" },
      { key: "payment_product_name_prefix", label: "商品名前缀", kind: "text" },
      { key: "payment_product_name_suffix", label: "商品名后缀", kind: "text" },
      { key: "payment_help_image_url", label: "支付帮助图片 URL", kind: "text" },
      { key: "payment_help_text", label: "支付帮助文本", kind: "textarea", rows: 4 },
      { key: "payment_cancel_rate_limit_enabled", label: "启用取消订单限流", kind: "boolean" },
      { key: "payment_cancel_rate_limit_max", label: "取消订单限流次数", kind: "number" },
      { key: "payment_cancel_rate_limit_window", label: "取消订单限流窗口", kind: "number" },
      {
        key: "payment_cancel_rate_limit_unit",
        label: "取消订单限流单位",
        kind: "select",
        options: [
          { value: "minute", label: "分钟" },
          { value: "hour", label: "小时" },
          { value: "day", label: "天" },
        ],
      },
      {
        key: "payment_cancel_rate_limit_window_mode",
        label: "取消订单限流窗口模式",
        kind: "select",
        options: [
          { value: "rolling", label: "滚动窗口" },
          { value: "fixed", label: "固定窗口" },
        ],
      },
      { key: "payment_alipay_force_qrcode", label: "支付宝强制二维码", kind: "boolean" },
      { key: "payment_visible_method_alipay_enabled", label: "前台显示支付宝", kind: "boolean" },
      { key: "payment_visible_method_alipay_source", label: "支付宝显示来源", kind: "text", placeholder: "official_alipay / easypay_alipay" },
      { key: "payment_visible_method_wxpay_enabled", label: "前台显示微信支付", kind: "boolean" },
      { key: "payment_visible_method_wxpay_source", label: "微信支付显示来源", kind: "text", placeholder: "official_wxpay / easypay_wxpay" },
    ],
  },
];

const allFields = settingSections.flatMap((section) => section.fields);

function asSettingsRecord(settings: unknown) {
  return settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
}

function defaultJsonValue(field: SettingField) {
  return field.jsonDefault ?? (field.key.endsWith("_subscriptions") ? [] : {});
}

function formatJson(value: unknown, field: SettingField) {
  return JSON.stringify(value ?? defaultJsonValue(field), null, 2);
}

function valueFromSettings(field: SettingField, settings: Record<string, unknown>): FormValue {
  const value = settings[field.key];
  switch (field.kind) {
    case "boolean":
      return value === true || value === "true";
    case "json":
      return formatJson(value, field);
    case "stringList":
      return Array.isArray(value) ? value.map(String).join("\n") : typeof value === "string" ? value : "";
    case "numberList":
      return Array.isArray(value) ? value.map(String).join(",") : typeof value === "string" ? value : "";
    case "secret":
      return "";
    default:
      return value === null || value === undefined ? "" : String(value);
  }
}

function splitList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function parseJsonField(field: SettingField, value: string) {
  const raw = value.trim();
  if (!raw) return defaultJsonValue(field);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`「${field.label}」不是有效 JSON`);
  }
}

function buildPayload(fields: SettingField[], form: Record<string, FormValue>) {
  const payload: Record<string, unknown> = {};

  for (const field of fields) {
    const value = form[field.key];
    if (field.kind === "boolean") {
      payload[field.key] = value === true;
      continue;
    }

    const text = typeof value === "string" ? value : "";
    if (field.kind === "secret") {
      if (text.trim()) payload[field.key] = text.trim();
      continue;
    }
    if (field.kind === "number") {
      const numeric = Number(text);
      payload[field.key] = Number.isFinite(numeric) ? numeric : 0;
      continue;
    }
    if (field.kind === "stringList") {
      payload[field.key] = splitList(text);
      continue;
    }
    if (field.kind === "numberList") {
      payload[field.key] = splitList(text).map(Number).filter((item) => Number.isFinite(item));
      continue;
    }
    if (field.kind === "json") {
      payload[field.key] = parseJsonField(field, text);
      continue;
    }

    payload[field.key] = text;
  }

  return payload;
}

export function SiteSettingsPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: settings, isLoading, isFetching, refetch } = trpc.siteSettings.get.useQuery({ connectionId });
  const [activeTab, setActiveTab] = useState(settingSections[0].key);
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [error, setError] = useState("");

  const settingsRecord = useMemo(() => asSettingsRecord(settings), [settings]);
  const activeSection = settingSections.find((section) => section.key === activeTab) ?? settingSections[0];

  const save = trpc.siteSettings.update.useMutation({
    onSuccess: async () => {
      setError("");
      await utils.siteSettings.get.invalidate({ connectionId });
      showToast({ title: "站点设置已保存", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "保存站点设置失败", description: e.message, variant: "error" });
    },
  });

  useEffect(() => {
    const record = asSettingsRecord(settings);
    const next: Record<string, FormValue> = {};
    for (const field of allFields) {
      next[field.key] = valueFromSettings(field, record);
    }
    setForm(next);
  }, [settings]);

  const setField = (key: string, value: FormValue) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    setError("");
    try {
      const payload = buildPayload(allFields, form);
      save.mutate({ connectionId, settings: payload });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast({ title: "保存站点设置失败", description: message, variant: "error" });
    }
  };

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      showToast({ title: "刷新站点设置失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "站点设置已刷新", variant: "success" });
  };

  const renderField = (field: SettingField) => {
    const value = form[field.key] ?? (field.kind === "boolean" ? false : "");
    const configured = field.configuredKey ? settingsRecord[field.configuredKey] === true : false;

    if (field.kind === "boolean") {
      return (
        <div className="flex min-h-20 items-center justify-between gap-4 rounded-md border border-border/70 px-3 py-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`setting-${field.key}`}>{field.label}</Label>
            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
            {field.configuredKey ? (
              <Badge variant={configured ? "success" : "secondary"}>{configured ? "依赖已配置" : "依赖未配置"}</Badge>
            ) : null}
          </div>
          <Switch id={`setting-${field.key}`} checked={value === true} onCheckedChange={(checked) => setField(field.key, checked)} disabled={save.isPending} />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex min-h-6 items-center gap-2">
          <Label htmlFor={`setting-${field.key}`}>{field.label}</Label>
          {field.kind === "secret" && field.configuredKey ? (
            <Badge variant={configured ? "success" : "secondary"}>{configured ? "已配置" : "未配置"}</Badge>
          ) : null}
        </div>
        {field.kind === "textarea" || field.kind === "json" || field.kind === "stringList" ? (
          <Textarea
            id={`setting-${field.key}`}
            className={field.kind === "json" ? "font-mono" : undefined}
            value={String(value)}
            rows={field.rows ?? (field.kind === "json" ? 5 : 4)}
            placeholder={field.placeholder}
            spellCheck={field.kind !== "json"}
            onChange={(event) => setField(field.key, event.target.value)}
          />
        ) : field.kind === "select" ? (
          <Select value={String(value)} onValueChange={(next) => setField(field.key, next)}>
            <SelectTrigger id={`setting-${field.key}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`setting-${field.key}`}
            type={field.kind === "number" ? "number" : field.kind === "secret" ? "password" : "text"}
            step={field.kind === "number" ? "any" : undefined}
            value={String(value)}
            placeholder={field.kind === "secret" ? "留空不更新" : field.placeholder}
            autoComplete={field.kind === "secret" ? "new-password" : undefined}
            onChange={(event) => setField(field.key, event.target.value)}
          />
        )}
        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">站点设置</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching || save.isPending}>
            {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {save.isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background/70 p-1">
        <div className="flex min-w-max gap-1">
          {settingSections.map((section) => (
            <Button
              key={section.key}
              type="button"
              variant={activeTab === section.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(section.key)}
            >
              {section.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activeSection.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{activeSection.description}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {activeSection.fields.map((field) => (
              <div
                key={field.key}
                className={field.kind === "textarea" || field.kind === "json" || field.kind === "stringList" ? "lg:col-span-2" : undefined}
              >
                {renderField(field)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
