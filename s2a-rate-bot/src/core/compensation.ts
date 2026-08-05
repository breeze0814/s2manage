export type CompensationRule = Readonly<{
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  ratePercent: number;
}>;

export type CompensationAssessment = Readonly<{
  eligible: boolean;
  ruleId: string | null;
  ruleName: string | null;
  ratePercent: number;
  roundedPaymentYuan: number;
  compensationFen: number;
  reason?: string;
}>;

export type CompensationSummary = Readonly<{
  eligibleOrderCount: number;
  invalidOrderCount: number;
  totalCompensationFen: number;
}>;

export type CompensationOrder = Readonly<{
  createTime: number;
  totalAmount: number;
}>;

const MILLISECONDS_PER_SECOND = 1_000;
const OUTSIDE_CAMPAIGN_MESSAGE = "不在补偿活动时间内";

export function calculateCompensation(
  order: CompensationOrder,
  rules: readonly CompensationRule[],
): CompensationAssessment {
  const roundedPaymentYuan = roundedPayment(order);
  const createdAt = order.createTime * MILLISECONDS_PER_SECOND;
  const rule = rules.find((item) => inWindow(createdAt, item));
  if (!rule) return ineligibleAssessment(roundedPaymentYuan);
  return eligibleAssessment(rule, roundedPaymentYuan);
}

export function summarizeCompensations(
  assessments: readonly CompensationAssessment[],
): CompensationSummary {
  const totalCompensationFen = assessments.reduce((sum, item) => sum + item.compensationFen, 0);
  if (!Number.isSafeInteger(totalCompensationFen)) throw new Error("补偿合计超出安全计算范围");
  return Object.freeze({
    eligibleOrderCount: assessments.filter((item) => item.eligible).length,
    invalidOrderCount: assessments.filter((item) => !item.eligible).length,
    totalCompensationFen,
  });
}

function roundedPayment(order: CompensationOrder) {
  if (!Number.isSafeInteger(order.createTime) || order.createTime < 0) {
    throw new Error("订单 createTime 必须是非负整数 Unix 秒");
  }
  if (!Number.isFinite(order.totalAmount) || order.totalAmount < 0) {
    throw new Error("订单 totalAmount 必须是非负有效金额");
  }
  const rounded = Math.round(order.totalAmount);
  if (!Number.isSafeInteger(rounded)) throw new Error("订单付款金额超出安全计算范围");
  return rounded;
}

function inWindow(createdAt: number, rule: CompensationRule) {
  return createdAt >= Date.parse(rule.startAt) && createdAt < Date.parse(rule.endAt);
}

function ineligibleAssessment(roundedPaymentYuan: number): CompensationAssessment {
  return Object.freeze({
    eligible: false,
    ruleId: null,
    ruleName: null,
    ratePercent: 0,
    roundedPaymentYuan,
    compensationFen: 0,
    reason: OUTSIDE_CAMPAIGN_MESSAGE,
  });
}

function eligibleAssessment(
  rule: CompensationRule,
  roundedPaymentYuan: number,
): CompensationAssessment {
  const compensationFen = roundedPaymentYuan * rule.ratePercent;
  if (!Number.isSafeInteger(compensationFen)) throw new Error("订单补偿金额超出安全计算范围");
  return Object.freeze({
    eligible: true,
    ruleId: rule.id,
    ruleName: rule.name,
    ratePercent: rule.ratePercent,
    roundedPaymentYuan,
    compensationFen,
  });
}
