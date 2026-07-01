import assert from "node:assert/strict";
import { formatRateMultiplier, normalizeRateMultiplier, ratesEqual, RATE_DECIMAL_PLACES } from "@/server/rates";
import { evaluateGroupRateRule } from "@/server/bl-bindings";

assert.equal(RATE_DECIMAL_PLACES, 2, "Rate multipliers should be normalized to two decimal places");
assert.equal(normalizeRateMultiplier(1.2345), 1.23, "Rate multiplier application should keep two decimals");
assert.equal(normalizeRateMultiplier(1.235), 1.24, "Rate multiplier application should round at the third decimal");
assert.equal(formatRateMultiplier(1.2), "1.2", "Rate display should trim unnecessary trailing zeros");
assert.equal(formatRateMultiplier(1.235), "1.24", "Rate display should use two-decimal normalization");
assert.equal(ratesEqual(1.234, 1.23), true, "Rate equality should compare two-decimal normalized values");
assert.equal(
  evaluateGroupRateRule({ rule: { enabled: true, mode: "average" }, sourceRates: [1.111, 1.222] }),
  1.17,
  "Applied group-rate rules should keep two decimals",
);
assert.equal(
  evaluateGroupRateRule({ rule: { enabled: true, mode: "custom", expression: "round(avg)" }, sourceRates: [1.111, 1.222] }),
  1.17,
  "Custom rule round() should default to two decimals",
);
