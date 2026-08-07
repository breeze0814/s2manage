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
import type { JsonOrderGateway } from "./json-order-gateway.ts";
import type { LiandongGateway } from "./liandong-gateway.ts";
import { CompensationOrderConflictError } from "./errors.ts";
import type {
  CompensationClaim,
  CompensationOrderSourceCheck,
  CompensationResult,
  CompensationSettings,
  LiandongOrder,
} from "./types.ts";

export type CompensationService = ReturnType<typeof createCompensationService>;

export function createCompensationService(input: Readonly<{
  config: CompensationConfigService;
  claims: CompensationClaimStore;
  liandong: LiandongGateway;
  jsonOrders: JsonOrderGateway;
  rewards: RewardCodeGateway;
  now?: () => Date;
  id?: () => string;
}>) {
  const now = input.now ?? (() => new Date());
  const id = input.id ?? randomUUID;
  return {
    calculate: (identity: EmbedIdentity, raw: unknown) => calculateClaim({ input, identity, raw, now, id }),
    testConnection: () => testOrderSource(input),
    listClaims: () => input.claims.list(),
  };
}

async function calculateClaim(context: CalculationContext) {
  const settings = requireActive(await context.input.config.get());
  const tradeNumbers = parseTradeNumbers(context.raw);
  const replay = await completedReplay(context.input.claims, tradeNumbers, context.identity);
  if (replay) return replay;
  const lookup = await openLookup(context.input, settings);
  const results = await performLookups({
    lookup, settings, tradeNumbers,
  });
  const summary = summarizeCompensations(assessments(results));
  const createdAt = context.now().toISOString();
  let claim: CompensationClaim;
  try {
    claim = await context.input.claims.create(
      pendingClaim({ id: context.id(), identity: context.identity,
        storeName: lookup.storeName, results, summary, createdAt }),
      redeemableTradeNumbers(results),
    );
  } catch (error) {
    if (!(error instanceof CompensationOrderConflictError)) throw error;
    const racedReplay = await completedReplay(context.input.claims, tradeNumbers, context.identity);
    if (!racedReplay) throw error;
    return racedReplay;
  }
  return issueReward(context.input, claim, context.now);
}

async function completedReplay(
  claims: CompensationClaimStore,
  tradeNumbers: readonly TradeNumber[],
  identity: EmbedIdentity,
): Promise<CompensationClaim | null> {
  const redemptions = await Promise.all(tradeNumbers.map((item) => claims.findRedemption(item.value)));
  const firstIndex = redemptions.findIndex((item) => item !== null);
  if (firstIndex < 0) return null;
  const conflict = () => new CompensationOrderConflictError(tradeNumbers[firstIndex]!.value);
  const first = redemptions[firstIndex]!;
  if (redemptions.some((item) => item?.status !== "redeemed" || item.claim.id !== first.claim.id)) throw conflict();
  if (first.claim.status !== "completed" || !first.claim.redemptionCode) throw conflict();
  if (first.claim.srcHost !== identity.srcHost || first.claim.sub2apiUserId !== identity.sub2apiUserId) throw conflict();
  return Object.freeze({ ...first.claim, alreadyRedeemed: true });
}

async function issueReward(input: ServiceDependencies, claim: CompensationClaim, now: () => Date) {
  if (claim.summary.totalCompensationFen === 0) {
    return input.claims.complete(claim.id, null, now().toISOString());
  }
  let reward: Readonly<{ code: string; id: number }>;
  try {
    const rewards = await input.rewards.generate({
      type: "balance",
      value: claim.summary.totalCompensationFen / 100,
      count: 1,
    });
    const generated = rewards[0];
    if (!generated) throw new Error("目标站未返回补偿兑换码");
    reward = generated;
  } catch (error) {
    await input.claims.fail(claim.id, errorMessage(error), now().toISOString());
    throw error;
  }
  return input.claims.complete(claim.id, reward, now().toISOString());
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
    const order = await input.lookup.findOrder(input.tradeNumber.value);
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
  storeName: string;
  results: readonly CompensationResult[];
  summary: ReturnType<typeof summarizeCompensations>;
  createdAt: string;
}>): CompensationClaim {
  return {
    id: input.id,
    srcHost: input.identity.srcHost,
    sub2apiUserId: input.identity.sub2apiUserId,
    sub2apiEmail: input.identity.sub2apiEmail || null,
    maskedEmail: maskEmail(input.identity.sub2apiEmail),
    storeName: input.storeName,
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

function redeemableTradeNumbers(results: readonly CompensationResult[]) {
  return Object.freeze(results.flatMap((item) => (
    item.status === "found" && item.compensation?.eligible && item.compensation.compensationFen > 0
      ? [item.requestedTradeNo]
      : []
  )));
}

function lookupMessage(tradeNumber: TradeNumber, status: "not_found" | "error", message: string) {
  return Object.freeze({
    lineNumber: tradeNumber.lineNumber,
    requestedTradeNo: tradeNumber.value,
    status,
    message,
  });
}

async function testOrderSource(input: ServiceDependencies): Promise<CompensationOrderSourceCheck> {
  const settings = await input.config.get();
  const lookup = await openLookup(input, settings);
  return Object.freeze({ source: settings.orderSource, name: lookup.storeName, orderCount: lookup.orderCount });
}

async function openLookup(input: ServiceDependencies, settings: CompensationSettings): Promise<OrderLookup> {
  if (settings.orderSource === "json") {
    const catalog = await input.jsonOrders.load();
    return Object.freeze({
      storeName: catalog.sourceName,
      orderCount: catalog.orderCount,
      findOrder: async (tradeNo: string) => catalog.findOrder(tradeNo),
    });
  }
  const session = await input.liandong.login(requireUrlCredentials(settings));
  return Object.freeze({
    storeName: session.profile.nickname || session.profile.username,
    orderCount: null,
    findOrder: (tradeNo: string) => input.liandong.findOrder(settings, session, tradeNo),
  });
}

function requireActive(settings: CompensationSettings) {
  if (!settings.enabled) throw new Error("订单补偿活动当前未开放");
  return settings;
}

function requireUrlCredentials(settings: CompensationSettings) {
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
  lookup: OrderLookup;
  settings: CompensationSettings;
  tradeNumbers: readonly TradeNumber[];
}>;
type LookupOrderContext = Omit<LookupContext, "tradeNumbers"> & Readonly<{ tradeNumber: TradeNumber }>;
type OrderLookup = Readonly<{
  storeName: string;
  orderCount: number | null;
  findOrder: (tradeNo: string) => Promise<LiandongOrder | null>;
}>;
