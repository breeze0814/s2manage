import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { parseGroupRule } from "./group-rule-schema.ts";
import { BadRequestError, readJsonBody, sendJson } from "./http.ts";
import { defaultBotCommandSettings } from "../storage/app-config.ts";
import type { AppConfig, AppStorage, BotSettings, SourceOverviewInput, TargetAccountSnapshot, TargetGroupSnapshot } from "../storage/app-config.ts";
import type { SourceRateSnapshot } from "../adapters/source-rates.ts";
import type { SourceAccountSnapshot } from "../adapters/source-account-client.ts";
import type { Sub2ApiGroup } from "../adapters/sub2api-admin.ts";

const targetSettingsSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  adminApiKey: z.string().trim().optional().default(""),
  clearAdminApiKey: z.boolean().default(false),
});
const botSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  wsUrl: z.string().trim().default(""),
  token: z.string().default(""),
  clearToken: z.boolean().default(false),
  targetGroupId: z.string().trim().default(""),
  mentionCommandEnabled: z.boolean().default(true),
  commandSettings: z.object({
    help: z.boolean().default(defaultBotCommandSettings.help),
    rate: z.boolean().default(defaultBotCommandSettings.rate),
    bind: z.boolean().default(defaultBotCommandSettings.bind),
    unbind: z.boolean().default(defaultBotCommandSettings.unbind),
    inviteHelp: z.boolean().default(defaultBotCommandSettings.inviteHelp),
    inviteMine: z.boolean().default(defaultBotCommandSettings.inviteMine),
    inviteLeaderboard: z.boolean().default(defaultBotCommandSettings.inviteLeaderboard),
  }).default(defaultBotCommandSettings),
  activePrivateMessageEnabled: z.boolean().default(true),
  scheduledStatsEnabled: z.boolean().default(true),
  inviteActivityStartDate: z.string().trim().default(""),
  inviteActivityActiveRewardAmount: z.number().finite().nonnegative().nullable().default(null),
  inviteActivityInactiveRewardAmount: z.number().finite().nonnegative().nullable().default(null),
  botUserId: z.string().trim().default(""),
});
const botConnectionSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  wsUrl: z.string().trim().default(""),
  token: z.string().default(""),
  clearToken: z.boolean().default(false),
  targetGroupId: z.string().trim().default(""),
  botUserId: z.string().trim().default(""),
});
const botCommandSettingsSchema = z.object({
  mentionCommandEnabled: z.boolean().default(true),
  commandSettings: z.object({
    help: z.boolean().default(defaultBotCommandSettings.help),
    rate: z.boolean().default(defaultBotCommandSettings.rate),
    bind: z.boolean().default(defaultBotCommandSettings.bind),
    unbind: z.boolean().default(defaultBotCommandSettings.unbind),
    inviteHelp: z.boolean().default(defaultBotCommandSettings.inviteHelp),
    inviteMine: z.boolean().default(defaultBotCommandSettings.inviteMine),
    inviteLeaderboard: z.boolean().default(defaultBotCommandSettings.inviteLeaderboard),
  }).default(defaultBotCommandSettings),
});
const botActiveSettingsSchema = z.object({
  activePrivateMessageEnabled: z.boolean().default(true),
});
const botInviteActivitySettingsSchema = z.object({
  scheduledStatsEnabled: z.boolean().default(true),
  inviteActivityStartDate: z.string().trim().default(""),
  inviteActivityActiveRewardAmount: z.number().finite().nonnegative().nullable().default(null),
  inviteActivityInactiveRewardAmount: z.number().finite().nonnegative().nullable().default(null),
});
const proxySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  httpProxy: z.string().trim().default(""),
  httpsProxy: z.string().trim().default(""),
});
const workerSettingsSchema = z.object({
  intervalSeconds: z.number().int().positive().min(10).max(86_400),
});
export async function handlePersistenceRoute(input: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly storage: AppStorage | null;
}) {
  if (input.pathname === "/api/app-config") return handleAppConfig(input);
  if (input.request.method !== "POST") return methodNotAllowed(input.response);
  if (input.pathname === "/api/settings/target") return handleTargetSettings(input);
  if (input.pathname === "/api/settings/bot") return handleBotSettings(input);
  if (input.pathname === "/api/settings/bot/connection") return handleBotConnectionSettings(input);
  if (input.pathname === "/api/settings/bot/commands") return handleBotCommandSettings(input);
  if (input.pathname === "/api/settings/bot/active") return handleBotActiveSettings(input);
  if (input.pathname === "/api/settings/bot/invite-activity") return handleBotInviteActivitySettings(input);
  if (input.pathname === "/api/settings/proxy") return handleProxySettings(input);
  if (input.pathname === "/api/settings/worker") return handleWorkerSettings(input);
  if (input.pathname === "/api/groups/rule") return handleGroupRule(input);
  return false;
}

export async function persistTargetGroups(storage: AppStorage | null, groups: readonly Sub2ApiGroup[]) {
  await requireStorage(storage).saveTargetGroups(groups.map(targetGroupSnapshot));
}

export async function persistTargetGroup(storage: AppStorage | null, group: Sub2ApiGroup) {
  await requireStorage(storage).saveTargetGroup(targetGroupSnapshot(group));
}

export async function persistTargetAccounts(storage: AppStorage | null, accounts: readonly TargetAccountSnapshot[]) {
  await requireStorage(storage).saveTargetAccounts(accounts);
}

export async function persistTargetAccount(storage: AppStorage | null, account: TargetAccountSnapshot) {
  await requireStorage(storage).saveTargetAccount(account);
}

export async function persistSourceOverview(input: {
  readonly storage: AppStorage | null;
  readonly requestBody: unknown;
  readonly account: SourceAccountSnapshot;
  readonly rates: readonly SourceRateSnapshot[];
}) {
  const parsed = sourceSiteSchema.parse(input.requestBody);
  return requireStorage(input.storage).saveSourceOverview({ site: parsed, account: input.account, rates: input.rates });
}

function handleAppConfig(input: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly storage: AppStorage | null;
}) {
  if (input.request.method !== "GET") return methodNotAllowed(input.response);
  return requireStorage(input.storage).getAppConfig().then((config) => {
    sendJson(input.response, 200, publicAppConfig(config));
    return true;
  });
}

async function handleTargetSettings(input: RouteInput) {
  const settings = targetSettingsSchema.parse(await readJsonBody(input.request));
  const storage = requireStorage(input.storage);
  const current = (await storage.getAppConfig()).target;
  const adminApiKey = settings.clearAdminApiKey ? "" : settings.adminApiKey || current?.adminApiKey || "";
  if (!adminApiKey && !settings.clearAdminApiKey) throw new BadRequestError("Admin API Key 不能为空");
  sendJson(input.response, 200, {
    target: {
      ...(await storage.saveTargetSettings({ name: settings.name, baseUrl: settings.baseUrl, adminApiKey })),
      adminApiKey: "",
      adminApiKeySet: Boolean(adminApiKey),
    },
  });
  return true;
}

async function handleBotSettings(input: RouteInput) {
  const settings = botSettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { bot: await requireStorage(input.storage).saveBotSettings(settings) });
  return true;
}

async function handleBotConnectionSettings(input: RouteInput) {
  const storage = requireStorage(input.storage);
  const current = (await storage.getAppConfig()).bot;
  const settings = botConnectionSettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, {
    bot: publicBotSettings(await storage.saveBotSettings({
      ...current,
      ...settings,
      token: settings.clearToken ? "" : settings.token.trim() ? settings.token : current.token,
    })),
  });
  return true;
}

async function handleBotCommandSettings(input: RouteInput) {
  const storage = requireStorage(input.storage);
  const current = (await storage.getAppConfig()).bot;
  const settings = botCommandSettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { bot: publicBotSettings(await storage.saveBotSettings({ ...current, ...settings })) });
  return true;
}

async function handleBotActiveSettings(input: RouteInput) {
  const storage = requireStorage(input.storage);
  const current = (await storage.getAppConfig()).bot;
  const settings = botActiveSettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { bot: publicBotSettings(await storage.saveBotSettings({ ...current, ...settings })) });
  return true;
}

async function handleBotInviteActivitySettings(input: RouteInput) {
  const storage = requireStorage(input.storage);
  const current = (await storage.getAppConfig()).bot;
  const settings = botInviteActivitySettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { bot: publicBotSettings(await storage.saveBotSettings({ ...current, ...settings })) });
  return true;
}

async function handleProxySettings(input: RouteInput) {
  const settings = proxySettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { proxy: await requireStorage(input.storage).saveProxySettings(settings) });
  return true;
}

async function handleWorkerSettings(input: RouteInput) {
  const settings = workerSettingsSchema.parse(await readJsonBody(input.request));
  sendJson(input.response, 200, { worker: await requireStorage(input.storage).saveWorkerSettings(settings) });
  return true;
}

async function handleGroupRule(input: RouteInput) {
  const rule = parseGroupRule(await readJsonBody(input.request));
  sendJson(input.response, 200, { rule: await requireStorage(input.storage).saveGroupRule(rule) });
  return true;
}

function targetGroupSnapshot(group: Sub2ApiGroup): TargetGroupSnapshot {
  return {
    id: group.id,
    name: group.name,
    status: group.status ?? "active",
    rate_multiplier: group.rate_multiplier ?? null,
  };
}

function methodNotAllowed(response: ServerResponse) {
  sendJson(response, 405, { error: "method not allowed" });
  return true;
}

function requireStorage(storage: AppStorage | null) {
  if (!storage) throw new Error("DATABASE_URL is required for persistent app data");
  return storage;
}

function publicAppConfig(config: AppConfig) {
  return {
    ...config,
    target: config.target ? {
      ...config.target,
      adminApiKey: "",
      adminApiKeySet: Boolean(config.target.adminApiKey),
    } : null,
    bot: publicBotSettings(config.bot),
    sources: config.sources.map((source) => ({
      ...source,
      accessToken: "",
      rtToken: "",
      password: "",
      accessTokenSet: Boolean(source.accessToken),
      rtTokenSet: Boolean(source.rtToken),
      passwordSet: Boolean(source.password),
    })),
  };
}

function publicBotSettings(bot: BotSettings) {
  return {
    ...bot,
    token: "",
    tokenSet: Boolean(bot.token),
  };
}

const sourceSiteSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  name: z.string().trim().optional(),
  siteType: z.enum(["sub2api", "newapi"]),
  baseUrl: z.string().trim().url(),
  authMode: z.enum(["manual_token", "password"]).default("manual_token"),
  accessToken: z.string().trim().optional(),
  rtToken: z.string().trim().optional(),
  username: z.string().trim().optional(),
  password: z.string().optional(),
  rechargeRatio: z.number().finite().positive().default(1),
  intervalSeconds: z.number().int().positive().default(3600),
  useProxy: z.boolean().default(false),
}).transform((value): SourceOverviewInput["site"] => ({
  id: value.sourceSiteId,
  name: value.name || `采集站 ${value.sourceSiteId}`,
  siteType: value.siteType,
  baseUrl: value.baseUrl,
  authMode: value.authMode,
  accessToken: value.accessToken ?? "",
  rtToken: value.rtToken ?? "",
  username: value.username ?? "",
  password: value.password ?? "",
  rechargeRatio: value.rechargeRatio,
  intervalSeconds: value.intervalSeconds,
  useProxy: value.useProxy,
}));

type RouteInput = {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly storage: AppStorage | null;
};
