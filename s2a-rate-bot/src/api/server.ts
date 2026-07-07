import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { getNewApiSourceAccount, getSub2ApiSourceAccount } from "../adapters/source-account-client.ts";
import { collectNewApiSourceRates, collectSub2ApiSourceRates } from "../adapters/source-rate-client.ts";
import { Sub2ApiAdminTarget } from "../adapters/sub2api-admin.ts";
import {
  inviteActivityPeriodForStartDate,
  inviteActivitySettlementPeriodForStartDate,
} from "../bot/invite-activity.ts";
import { loadInviteActivitySummary } from "../bot/scheduler.ts";
import { readRuntimeConfig, type RuntimeConfig } from "../shared/config.ts";
import { buildStatus } from "../shared/status.ts";
import type { AppStorage, AppStorageFactory } from "../storage/app-config.ts";
import { createSqliteAppStorage } from "../storage/sqlite-app-storage.ts";
import { handleApplyGroupRule } from "./group-rule-routes.ts";
import { BadRequestError, errorMessage, readJsonBody, sendError, sendJson } from "./http.ts";
import {
  handlePersistenceRoute,
  persistTargetAccount,
  persistTargetAccounts,
  persistSourceOverview,
  persistTargetGroup,
  persistTargetGroups,
} from "./persistence-routes.ts";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const uiDir = join(rootDir, "ui");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const targetConfigSchema = z.object({
  baseUrl: z.string().trim().url(),
  adminApiKey: z.string().trim().min(1),
});
const updateGroupRateSchema = targetConfigSchema.extend({
  groupId: z.number().int().positive(),
  rateMultiplier: z.number().finite().positive(),
});
const updateAccountSchedulableSchema = targetConfigSchema.extend({
  accountId: z.number().int().positive(),
  schedulable: z.boolean(),
});
const inviteActivityPreviewSchema = targetConfigSchema.extend({
  activityEnabled: z.boolean().default(true),
  startDate: z.string().trim().optional(),
  activeRewardAmount: z.number().finite().nonnegative().nullable().optional(),
  inactiveRewardAmount: z.number().finite().nonnegative().nullable().optional(),
});
const sourceRatesSchema = z.object({
  sourceSiteId: z.number().int().positive(),
  siteType: z.enum(["sub2api", "newapi"]),
  baseUrl: z.string().trim().url(),
  authMode: z.enum(["manual_token", "password"]).default("manual_token"),
  accessToken: z.string().trim().optional(),
  rtToken: z.string().trim().optional(),
  username: z.string().trim().optional(),
  password: z.string().optional(),
  rechargeRatio: z.number().finite().positive().default(1),
  useProxy: z.boolean().default(false),
  proxyUrl: z.string().trim().url().optional(),
});

async function handleTargetGroups(
  request: IncomingMessage,
  response: ServerResponse,
  storage: AppStorage | null,
) {
  const input = await resolveTargetConfig(await readJsonBody(request), storage);
  const client = new Sub2ApiAdminTarget(input.baseUrl, input.adminApiKey);
  const groups = await client.listGroups();
  await persistTargetGroups(storage, groups);
  sendJson(response, 200, { groups });
}

async function handleTargetGroupRate(
  request: IncomingMessage,
  response: ServerResponse,
  storage: AppStorage | null,
) {
  const body = await readJsonBody(request);
  const target = await resolveTargetConfig(body, storage);
  const input = updateGroupRateSchema.omit({ baseUrl: true, adminApiKey: true }).parse(body);
  const client = new Sub2ApiAdminTarget(target.baseUrl, target.adminApiKey);
  const group = await client.updateGroupRateMultiplier(input.groupId, input.rateMultiplier);
  await persistTargetGroup(storage, group);
  sendJson(response, 200, { group });
}

async function handleTargetAccounts(
  request: IncomingMessage,
  response: ServerResponse,
  storage: AppStorage | null,
) {
  const input = await resolveTargetConfig(await readJsonBody(request), storage);
  const accounts = await new Sub2ApiAdminTarget(input.baseUrl, input.adminApiKey).listAccounts();
  await persistTargetAccounts(storage, accounts);
  sendJson(response, 200, { accounts });
}

async function handleTargetAccountSchedulable(
  request: IncomingMessage,
  response: ServerResponse,
  storage: AppStorage | null,
) {
  const body = await readJsonBody(request);
  const target = await resolveTargetConfig(body, storage);
  const input = updateAccountSchedulableSchema.omit({ baseUrl: true, adminApiKey: true }).parse(body);
  const client = new Sub2ApiAdminTarget(target.baseUrl, target.adminApiKey);
  const account = await client.setAccountSchedulable(input.accountId, input.schedulable);
  await persistTargetAccount(storage, account);
  sendJson(response, 200, { account });
}

async function handleSourceRates(
  request: IncomingMessage,
  response: ServerResponse,
  proxyUrl: string | null,
  storage: AppStorage | null,
) {
  const input = await resolveSourceInput(await readJsonBody(request), storage);
  const requestInput = sourceRequest(input, proxyUrl);
  const rates = input.siteType === "newapi"
    ? await collectNewApiSourceRates(requestInput)
    : await collectSub2ApiSourceRates(requestInput);
  sendJson(response, 200, { rates });
}

async function handleSourceOverview(
  request: IncomingMessage,
  response: ServerResponse,
  proxyUrl: string | null,
  storage: AppStorage | null,
) {
  const body = await readJsonBody(request);
  const input = await resolveSourceInput(body, storage);
  const requestInput = sourceRequest(input, proxyUrl);
  const [account, rates] = input.siteType === "newapi"
    ? await Promise.all([
      getNewApiSourceAccount(requestInput),
      collectNewApiSourceRates(requestInput),
    ])
    : await Promise.all([
      getSub2ApiSourceAccount(requestInput),
      collectSub2ApiSourceRates(requestInput),
    ]);
  const source = await persistSourceOverview({ storage, requestBody: body, account, rates });
  sendJson(response, 200, { account, rates, source });
}

async function handleInviteActivityPreview(request: IncomingMessage, response: ServerResponse, storage: AppStorage | null) {
  const body = await readJsonBody(request);
  const input = inviteActivityPreviewSchema.omit({ baseUrl: true, adminApiKey: true }).parse(body);
  const target = await resolveTargetConfig(body, storage);
  const now = new Date();
  const client = new Sub2ApiAdminTarget(target.baseUrl, target.adminApiKey);
  const summary = await loadInviteActivitySummary({
    now,
    client,
    activityEnabled: input.activityEnabled,
    startDate: input.startDate,
    activeRewardAmount: input.activeRewardAmount,
    inactiveRewardAmount: input.inactiveRewardAmount,
  });
  sendJson(response, 200, { summary, activityStatus: inviteActivityStatus(input.startDate, now) });
}

async function resolveTargetConfig(body: unknown, storage: AppStorage | null) {
  const input = z.object({
    baseUrl: z.string().trim().optional(),
    adminApiKey: z.string().trim().optional(),
  }).parse(body);
  const saved = storage ? (await storage.getAppConfig()).target : null;
  return targetConfigSchema.parse({
    baseUrl: input.baseUrl || saved?.baseUrl,
    adminApiKey: input.adminApiKey || saved?.adminApiKey,
  });
}

async function resolveSourceInput(body: unknown, storage: AppStorage | null) {
  const input = sourceRatesSchema.parse(body);
  const saved = storage
    ? (await storage.getAppConfig()).sources.find((source) => source.id === input.sourceSiteId)
    : null;
  if (!saved) return input;
  return {
    ...input,
    accessToken: input.accessToken || saved.accessToken,
    rtToken: input.rtToken || saved.rtToken,
    username: input.username || saved.username,
    password: input.password || saved.password,
  };
}

function inviteActivityStatus(startDate: string | undefined, now: Date) {
  if (!startDate) {
    return {
      currentPeriod: null,
      settlementPeriod: null,
      nextSettlementDate: null,
    };
  }
  const currentPeriod = inviteActivityPeriodForStartDate(startDate, now);
  const settlementPeriod = inviteActivitySettlementPeriodForStartDate(startDate, now);
  return {
    currentPeriod: {
      startDate: currentPeriod.startDate,
      endDate: currentPeriod.endDate,
    },
    settlementPeriod: settlementPeriod ? {
      startDate: settlementPeriod.startDate,
      endDate: settlementPeriod.endDate,
    } : null,
    nextSettlementDate: currentPeriod.endDate,
  };
}

function sourceRequest(input: z.infer<typeof sourceRatesSchema>, proxyUrl: string | null) {
  return {
    sourceSiteId: input.sourceSiteId,
    baseUrl: input.baseUrl,
    auth: sourceAuth(input),
    rechargeRatio: input.rechargeRatio,
    proxyUrl: input.useProxy ? input.proxyUrl ?? proxyUrl : null,
  };
}

function sourceAuth(input: z.infer<typeof sourceRatesSchema>) {
  if (input.authMode === "password") {
    if (!input.username || !input.password) throw new BadRequestError("账号密码认证需要 username 和 password");
    return {
      mode: "password" as const,
      username: input.username,
      password: input.password,
    };
  }
  if (!input.accessToken && !input.rtToken) throw new BadRequestError("手动 Token 认证需要 accessToken 或 rtToken");
  return {
    mode: "manual_token" as const,
    accessToken: input.accessToken ?? "",
    rtToken: input.rtToken,
  };
}

async function handleApiRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  proxyUrl: string | null,
  storage: AppStorage | null,
) {
  if (pathname === "/api/runtime/events") {
    await handleRuntimeEvents(request, response, storage);
    return true;
  }
  if (await handlePersistenceRoute({ request, response, pathname, storage })) return true;
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method not allowed" });
    return true;
  }
  if (pathname === "/api/target/groups") await handleTargetGroups(request, response, storage);
  else if (pathname === "/api/target/group-rate") await handleTargetGroupRate(request, response, storage);
  else if (pathname === "/api/target/accounts") await handleTargetAccounts(request, response, storage);
  else if (pathname === "/api/target/account-schedulable") await handleTargetAccountSchedulable(request, response, storage);
  else if (pathname === "/api/groups/apply-rule") await handleApplyGroupRule({ request, response, storage });
  else if (pathname === "/api/bot/invite-activity") await handleInviteActivityPreview(request, response, storage);
  else if (pathname === "/api/source/rates") await handleSourceRates(request, response, proxyUrl, storage);
  else if (pathname === "/api/source/overview") await handleSourceOverview(request, response, proxyUrl, storage);
  else return false;
  return true;
}

async function handleRuntimeEvents(
  request: IncomingMessage,
  response: ServerResponse,
  storage: AppStorage | null,
) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method not allowed" });
    return;
  }
  const events = storage ? await storage.listRuntimeEvents({ limit: 30 }) : [];
  sendJson(response, 200, { events });
}

function safeUiPath(pathname: string) {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = resolve(uiDir, `.${filePath}`);
  if (!resolved.startsWith(uiDir)) return null;
  return resolved;
}

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = safeUiPath(url.pathname);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

export function createHandler(
  config = readRuntimeConfig(),
  storageFactory: AppStorageFactory = createSqliteAppStorage,
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    try {
      if (url.pathname === "/api/status") {
        const services = await withStorage(config, storageFactory, async (storage) =>
          buildStatus({
            databaseUrl: config.databaseUrl,
            appConfig: storage ? await storage.getAppConfig() : null,
            runtimeEvents: storage ? await storage.listRuntimeEvents({ limit: 20 }) : [],
          })
        );
        sendJson(response, 200, { services });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        const handled = await withStorage(config, storageFactory, (storage) =>
          handleApiRoute(request, response, url.pathname, config.proxyUrl, storage)
        );
        if (handled) return;
        sendJson(response, 404, { error: "api route not found" });
        return;
      }
      await serveStatic(request, response);
    } catch (error) {
      sendError(response, error instanceof z.ZodError || error instanceof BadRequestError ? 400 : 502, error);
    }
  };
}

async function withStorage<T>(
  config: RuntimeConfig,
  storageFactory: AppStorageFactory,
  task: (storage: AppStorage | null) => Promise<T>,
) {
  const storage = config.databaseUrl ? storageFactory(config.databaseUrl) : null;
  try {
    return await task(storage);
  } finally {
    storage?.close();
  }
}

export function startApiServer() {
  const config = readRuntimeConfig();
  const server = createServer(createHandler(config));
  server.listen(config.port, config.host, () => {
    console.log(`[api] S2A Rate Bot listening on http://${config.host}:${config.port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startApiServer();
}
