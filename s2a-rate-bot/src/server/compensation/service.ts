import { randomUUID } from "node:crypto";
import {
  calculateCompensation,
  summarizeCompensations,
  type CompensationAssessment,
} from "../../core/compensation.ts";
import type { EmbedIdentity } from "../embeds/types.ts";
import type { RewardCodeGateway } from "../embeds/reward-code-gateway.ts";
import type { CompensationClaimStore } from "./claim-store.ts";
import type { CompensationConfigService } from "./config-service.ts";
import type { LiandongGateway } from "./liandong-gateway.ts";
import type {
  CompensationClaim,
  CompensationResult,
  CompensationSettings,
  LiandongSession,
} from "./types.ts";

export type CompensationService = ReturnType<typeof createCompensationService>;

export function createCompensationService(input: Readonly<{
  config: CompensationConfigService;
  claims: CompensationClaimStore;
  liandong: LiandongGateway;
  rewards: RewardCodeGateway;
  now?: () => Date;
  id?: () => string;
}>) {
  const now = input.now ?? (() => new Date());
  const id = input.id ?? randomUUID;
  return {
    calculate: (identity: EmbedIdentity, raw: unknown) => calculateClaim({ input, identity, raw, now, id }),
    testConnection: async () => (await input.liandong.login(requireCredentials(await input.config.get()))).profile,
    listClaims: () => input.claims.list(),
  };
}

async function calculateClaim(context: CalculationContext) {
  const settings = requireActive(await context.input.config.get());
  const tradeNumbers = parseTradeNumbers(context.raw);
  const session = await context.input.liandong.login(settings);
  const results = await performLookups({
    gateway: context.input.liandong, settings, session, tradeNumbers,
  });
  const summary = summarizeCompensations(assessments(results));
  const createdAt = context.now().toISOString();
  const claim = await context.input.claims.create(pendingClaim({
    id: context.id(), identity: context.identity, session, results, summary, createdAt,
  }));
  return issueReward(context.input, claim, context.now);
}

async function issueReward(input: ServiceDependencies, claim: CompensationClaim, now: () => Date) {
  if (claim.summary.totalCompensationFen === 0) {
    return input.claims.complete(claim.id, null, now().toISOString());
  }
  try {
    const rewards = await input.rewards.generate({
      type: "balance",
      value: claim.summary.totalCompensationFen / 100,
      count: 1,
    });
    const reward = rewards[0];
    if (!reward) throw new Error("目标站未返回补偿兑换码");
    return input.claims.complete(claim.id, reward, now().toISOString());
  } catch (error) {
    await input.claims.fail(claim.id, errorMessage(error), now().toISOString());
    throw error;
  }
}

async function performLookups(input: LookupContext) {
  const results: CompensationResult[] = [];
  for (const tradeNumber of input.tradeNumbers) {
    results.push(await lookupOrder({ ...input, tradeNumber }));
  }
  return Object.freeze(results);
}

async function lookupOrder(input: LookupOrderContext): Promise<CompensationResult> {
  try {
    const order = await input.gateway.findOrder(input.settings, input.session, input.tradeNumber.value);
    if (!order) return lookupMessage(input.tradeNumber, "not_found", "当前店铺未查询到该订单");
    return Object.freeze({
      lineNumber: input.tradeNumber.lineNumber,
      requestedTradeNo: input.tradeNumber.value,
      status: "found" as const,
      order: { tradeNo: order.tradeNo, goodsName: order.goodsName,
        totalAmount: order.totalAmount, createTime: order.createTime },
      compensation: calculateCompensation(order, input.settings.rules),
    });
  } catch (error) {
    return lookupMessage(input.tradeNumber, "error", errorMessage(error));
  }
}

function pendingClaim(input: Readonly<{
  id: string;
  identity: EmbedIdentity;
  session: LiandongSession;
  results: readonly CompensationResult[];
  summary: ReturnType<typeof summarizeCompensations>;
  createdAt: string;
}>): CompensationClaim {
  return {
    id: input.id,
    srcHost: input.identity.srcHost,
    sub2apiUserId: input.identity.sub2apiUserId,
    maskedEmail: maskEmail(input.identity.sub2apiEmail),
    storeName: input.session.profile.nickname || input.session.profile.username,
    status: "pending",
    results: input.results,
    summary: input.summary,
    redemptionCode: null,
    rewardCodeId: null,
    errorMessage: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function parseTradeNumbers(raw: unknown): readonly TradeNumber[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("请求体必须是 JSON 对象");
  const orders = (raw as Record<string, unknown>).orders;
  if (typeof orders !== "string") throw new Error("订单号输入必须是文本");
  const values = orders.split(/\r?\n/)
    .map((value, index) => Object.freeze({ lineNumber: index + 1, value: value.trim() }))
    .filter((item) => item.value.length > 0);
  if (!values.length) throw new Error("请至少输入一个订单号，每行一个");
  return Object.freeze(values);
}

function assessments(results: readonly CompensationResult[]): readonly CompensationAssessment[] {
  return Object.freeze(results.flatMap((item) => item.compensation ? [item.compensation] : []));
}

function lookupMessage(tradeNumber: TradeNumber, status: "not_found" | "error", message: string) {
  return Object.freeze({
    lineNumber: tradeNumber.lineNumber,
    requestedTradeNo: tradeNumber.value,
    status,
    message,
  });
}

function requireActive(settings: CompensationSettings) {
  if (!settings.enabled) throw new Error("订单补偿活动当前未开放");
  return requireCredentials(settings);
}

function requireCredentials(settings: CompensationSettings) {
  if (!settings.username || !settings.password) throw new Error("联动小铺账号尚未配置完整");
  return settings;
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  return domain ? `${local?.slice(0, 1) || "*"}***@${domain}` : "***";
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
type TradeNumber = Readonly<{ lineNumber: number; value: string }>;
type ServiceDependencies = Parameters<typeof createCompensationService>[0];
type CalculationContext = Readonly<{
  input: ServiceDependencies;
  identity: EmbedIdentity;
  raw: unknown;
  now: () => Date;
  id: () => string;
}>;
type LookupContext = Readonly<{
  gateway: LiandongGateway;
  settings: CompensationSettings;
  session: LiandongSession;
  tradeNumbers: readonly TradeNumber[];
}>;
type LookupOrderContext = Omit<LookupContext, "tradeNumbers"> & Readonly<{ tradeNumber: TradeNumber }>;
