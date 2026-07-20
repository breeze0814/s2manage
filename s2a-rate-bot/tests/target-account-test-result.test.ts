import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTargetAccountTestResponse } from "../src/server/target-accounts/test-result.ts";

test("account test parser reads JSON success and preserves remote latency", () => {
  const result = parseTargetAccountTestResponse(JSON.stringify({
    code: 0,
    data: { success: true, message: "ok", latency_ms: 42, model: "claude-sonnet-4" },
  }), 100);
  assert.deepEqual(result, { success: true, message: "ok", latencyMs: 42, model: "claude-sonnet-4" });
});

test("account test parser exposes SSE error events as unavailable", () => {
  const raw = [
    'data: {"type":"test_start","model":"gpt-4o-mini"}',
    "",
    'data: {"type":"error","error":"upstream unavailable"}',
    "",
  ].join("\n");
  assert.deepEqual(parseTargetAccountTestResponse(raw, 77), {
    success: false,
    message: "upstream unavailable",
    latencyMs: 77,
    model: "gpt-4o-mini",
  });
});

test("account test parser rejects invalid JSON result shapes", () => {
  assert.throws(() => parseTargetAccountTestResponse('{"code":0,"data":{"message":"missing success"}}', 5), /响应无效/);
});
