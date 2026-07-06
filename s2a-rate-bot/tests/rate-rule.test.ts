import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateRateRule, resolveRateUpdate } from "../src/core/rate-rule.ts";

test("evaluates average source rates with offset and two decimal normalization", () => {
  const result = evaluateRateRule({
    rule: { enabled: true, mode: "average", offset: 0.05 },
    sourceRates: [1.111, 1.219],
    currentRate: 1,
  });

  assert.equal(result, 1.22);
});

test("rejects enabled rules without finite source rates", () => {
  assert.throws(
    () => evaluateRateRule({
      rule: { enabled: true, mode: "first", offset: 0 },
      sourceRates: [null, Number.NaN],
      currentRate: 1,
    }),
    /没有可用于计算的采集源倍率/,
  );
});

test("resolves no update when normalized target rate is unchanged", () => {
  const decision = resolveRateUpdate({
    target: { id: 8, name: "VIP", currentRate: 1.204 },
    rule: { enabled: true, mode: "first", offset: 0 },
    sourceRates: [1.2],
  });

  assert.deepEqual(decision, {
    action: "skip",
    targetId: 8,
    targetName: "VIP",
    currentRate: 1.2,
    nextRate: 1.2,
    reason: "target rate unchanged",
  });
});

test("resolves update when computed rate differs from target rate", () => {
  const decision = resolveRateUpdate({
    target: { id: 9, name: "标准", currentRate: 1 },
    rule: { enabled: true, mode: "max", offset: -0.1, multiplier: 1 },
    sourceRates: [1.1, 1.4],
  });

  assert.deepEqual(decision, {
    action: "update",
    targetId: 9,
    targetName: "标准",
    currentRate: 1,
    nextRate: 1.3,
  });
});

test("evaluates multiple source groups with min max multiplier and fixed offset", () => {
  assert.equal(evaluateRateRule({
    rule: { enabled: true, mode: "max", offset: 0.25, multiplier: 2 },
    sourceRates: [1.1, 1.4, 1.2],
    currentRate: 1,
  }), 3.05);

  assert.equal(evaluateRateRule({
    rule: { enabled: true, mode: "min", offset: -0.1, multiplier: 3 },
    sourceRates: [1.1, 1.4, 1.2],
    currentRate: 1,
  }), 3.2);
});

test("evaluates average formula before multiplier and fixed offset", () => {
  const result = evaluateRateRule({
    rule: { enabled: true, mode: "avg_formula", formula: "10*avg", offset: 1, multiplier: 0.5 },
    sourceRates: [1, 3],
    currentRate: 1,
  });

  assert.equal(result, 11);
});

test("rejects invalid average formulas instead of evaluating arbitrary code", () => {
  assert.throws(
    () => evaluateRateRule({
      rule: { enabled: true, mode: "avg_formula", formula: "process.exit()", offset: 0, multiplier: 1 },
      sourceRates: [1, 2],
      currentRate: 1,
    }),
    /公式/,
  );
});
