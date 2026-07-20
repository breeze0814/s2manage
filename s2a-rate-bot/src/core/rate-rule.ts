import { normalizeRateMultiplier, ratesEqual, toFiniteRate } from "./rates.ts";

export type RateRuleMode = "first" | "average" | "min" | "max" | "avg_formula";

export type RateRule = {
  readonly enabled: boolean;
  readonly mode: RateRuleMode;
  readonly offset: number;
  readonly minimum?: number;
  readonly formula?: string;
};

export type RateTarget = {
  readonly id: number;
  readonly name: string;
  readonly currentRate: number | null;
};

export type RateUpdateDecision =
  | {
    readonly action: "update";
    readonly targetId: number;
    readonly targetName: string;
    readonly currentRate: number | null;
    readonly nextRate: number;
  }
  | {
    readonly action: "skip";
    readonly targetId: number;
    readonly targetName: string;
    readonly currentRate: number | null;
    readonly nextRate: number | null;
    readonly reason: string;
  };

const MAX_RATE_MULTIPLIER = 100_000;
const FORMULA_TOKEN_PATTERN = /\s*([0-9]+(?:\.[0-9]+)?|avg|[()+\-*/])\s*/gy;

function validSourceRates(values: readonly unknown[]) {
  return values.map(toFiniteRate).filter((value): value is number => value !== null);
}

function baseRate(mode: RateRuleMode, rates: readonly number[]) {
  if (mode === "average") {
    return rates.reduce((total, value) => total + value, 0) / rates.length;
  }
  if (mode === "avg_formula") {
    return rates.reduce((total, value) => total + value, 0) / rates.length;
  }
  if (mode === "min") return Math.min(...rates);
  if (mode === "max") return Math.max(...rates);
  return rates[0];
}

function assertAllowedRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("规则计算结果必须是大于 0 的有效倍率");
  }
  if (value > MAX_RATE_MULTIPLIER) {
    throw new Error("规则计算结果超过允许范围");
  }
}

export function evaluateRateRule(input: {
  readonly rule: RateRule;
  readonly sourceRates: readonly unknown[];
  readonly currentRate: number | null;
}) {
  if (!input.rule.enabled) return normalizeRateMultiplier(input.currentRate ?? 1);
  const rates = validSourceRates(input.sourceRates);
  if (rates.length === 0) throw new Error("没有可用于计算的采集源倍率");
  const base = baseRuleRate(input.rule, rates);
  const adjusted = base + input.rule.offset;
  const nextRate = normalizeRateMultiplier(Math.max(adjusted, ruleMinimum(input.rule)));
  assertAllowedRate(nextRate);
  return nextRate;
}

function baseRuleRate(rule: RateRule, rates: readonly number[]) {
  const base = baseRate(rule.mode, rates);
  const formulaAverage = normalizeRateMultiplier(base);
  return rule.mode === "avg_formula" ? evaluateAverageFormula(rule.formula ?? "avg", formulaAverage) : base;
}

function ruleMinimum(rule: RateRule) {
  const minimum = rule.minimum ?? 0;
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new Error("计算最小值必须是大于或等于 0 的有效数字");
  }
  return minimum;
}

function evaluateAverageFormula(formula: string, avg: number) {
  const parser = formulaParser(tokenizeFormula(formula), avg);
  const result = parser.parseExpression();
  if (!parser.done()) throw new Error("公式包含无法解析的内容");
  return result;
}

function tokenizeFormula(formula: string) {
  const tokens: string[] = [];
  let cursor = 0;
  FORMULA_TOKEN_PATTERN.lastIndex = 0;
  while (cursor < formula.length) {
    FORMULA_TOKEN_PATTERN.lastIndex = cursor;
    const match = FORMULA_TOKEN_PATTERN.exec(formula);
    if (!match || match.index !== cursor) throw new Error("公式只能包含数字、avg、加减乘除和括号");
    tokens.push(match[1] ?? "");
    cursor = FORMULA_TOKEN_PATTERN.lastIndex;
  }
  if (tokens.length === 0) throw new Error("公式不能为空");
  return tokens;
}

function formulaParser(tokens: readonly string[], avg: number) {
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = take();
      const next = parseTerm();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const operator = take();
      const next = parseFactor();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  return { parseExpression, done: () => index === tokens.length, parseFactor: () => parseFactor() };

  function parseFactor(): number {
    const token = take();
    if (token === "avg") return avg;
    if (token === "+") return parseFactor();
    if (token === "-") return -parseFactor();
    if (token === "(") return parseParenthesized();
    const value = Number(token);
    if (Number.isFinite(value)) return value;
    throw new Error("公式包含无效项");
  }

  function parseParenthesized() {
    const value = parseExpression();
    if (take() !== ")") throw new Error("公式括号不匹配");
    return value;
  }
}

export function resolveRateUpdate(input: {
  readonly target: RateTarget;
  readonly rule: RateRule;
  readonly sourceRates: readonly unknown[];
}): RateUpdateDecision {
  const currentRate = input.target.currentRate === null ? null : normalizeRateMultiplier(input.target.currentRate);
  if (!input.rule.enabled) {
    return skipDecision({ target: input.target, currentRate, nextRate: currentRate, reason: "rate rule disabled" });
  }
  const nextRate = evaluateRateRule({
    rule: input.rule,
    sourceRates: input.sourceRates,
    currentRate,
  });
  if (currentRate !== null && ratesEqual(currentRate, nextRate)) {
    return skipDecision({ target: input.target, currentRate, nextRate, reason: "target rate unchanged" });
  }
  return {
    action: "update",
    targetId: input.target.id,
    targetName: input.target.name,
    currentRate,
    nextRate,
  };
}

function skipDecision(input: Readonly<{
  target: RateTarget;
  currentRate: number | null;
  nextRate: number | null;
  reason: string;
}>): RateUpdateDecision {
  return {
    action: "skip",
    targetId: input.target.id,
    targetName: input.target.name,
    currentRate: input.currentRate,
    nextRate: input.nextRate,
    reason: input.reason,
  };
}
