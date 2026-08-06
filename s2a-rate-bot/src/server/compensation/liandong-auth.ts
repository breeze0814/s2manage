import type { JsonRequest, JsonTransport } from "./http.ts";
import type { LiandongCredentials, LiandongSession } from "./types.ts";

const CHECK_SAFE_MODE_PATH = "/merchantApi/user/checkSafeMode";
const LOGIN_PATH = "/merchantApi/user/login";
const USER_INFO_PATH = "/merchantApi/user/userinfo";
const SUCCESS_CODE = 1;
const SAFE_MODE_DISABLED = 0;

type JsonRecord = Record<string, unknown>;

export async function loginLiandong(input: Readonly<{
  baseUrl: string;
  credentials: LiandongCredentials;
  transport: JsonTransport;
}>): Promise<LiandongSession> {
  const endpoint = origin(input.baseUrl);
  const credentials = normalizeCredentials(input.credentials);
  await checkSafeMode(endpoint, credentials, input.transport);
  const merchantToken = await login(endpoint, credentials, input.transport);
  const profile = await fetchProfile(endpoint, merchantToken, input.transport);
  return Object.freeze({ merchantToken, profile });
}

async function checkSafeMode(
  endpoint: string,
  credentials: LiandongCredentials,
  transport: JsonTransport,
) {
  const payload = await transport.request(jsonRequest(`${endpoint}${CHECK_SAFE_MODE_PATH}`, credentials));
  const data = record(successResponse(payload, "安全模式检查失败").data, "安全模式检查 data");
  const safeMode = number(data.safe_mode, "safe_mode");
  if (safeMode !== SAFE_MODE_DISABLED) {
    throw new Error(`当前店铺启用了安全模式（safe_mode=${safeMode}），无法直接协议登录`);
  }
}

async function login(endpoint: string, credentials: LiandongCredentials, transport: JsonTransport) {
  const payload = await transport.request(jsonRequest(`${endpoint}${LOGIN_PATH}`, credentials));
  const data = record(successResponse(payload, "店铺登录失败").data, "登录 data");
  const token = text(data.merchant_token, "merchant_token");
  if (!token) throw new Error("登录响应缺少 merchant_token");
  return token;
}

async function fetchProfile(endpoint: string, token: string, transport: JsonTransport) {
  const payload = await transport.request({
    ...jsonRequest(`${endpoint}${USER_INFO_PATH}`, {}),
    headers: protocolHeaders(token),
  });
  const data = record(successResponse(payload, "获取店铺资料失败").data, "店铺资料 data");
  return Object.freeze({
    id: number(data.id, "id"),
    username: text(data.username, "username"),
    nickname: text(data.nickname, "nickname"),
    sellCount: number(data.sell_count, "sell_count"),
  });
}

function normalizeCredentials(credentials: LiandongCredentials) {
  const username = credentials.username.trim();
  if (!username) throw new Error("联动小铺用户名不能为空");
  if (!credentials.password) throw new Error("联动小铺密码不能为空");
  return Object.freeze({ username, password: credentials.password });
}

function jsonRequest(url: string, body: Readonly<Record<string, unknown>>): JsonRequest {
  return { url, headers: protocolHeaders(), body };
}

function protocolHeaders(token?: string) {
  return Object.freeze({
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ...(token ? { "merchant-token": token } : {}),
  });
}

function origin(baseUrl: string) {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("联动小铺地址必须使用 HTTP 或 HTTPS");
  return url.origin;
}

function successResponse(payload: unknown, fallback: string) {
  const response = record(payload, "响应");
  if (response.code !== SUCCESS_CODE) throw new Error(optionalText(response.msg) || fallback);
  return response;
}

function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} 不是对象`);
  return value as JsonRecord;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} 不是字符串`);
  return value.trim();
}

function optionalText(value: unknown) { return typeof value === "string" ? value : ""; }

function number(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 不是有效数字`);
  return value;
}
