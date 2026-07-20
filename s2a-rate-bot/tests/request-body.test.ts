import assert from "node:assert/strict";
import { test } from "node:test";
import { collectionError } from "../src/server/collection/route-support.ts";
import { RequestBodyError, readJsonBody, readJsonObject } from "../src/server/http/request-body.ts";

test("request body reader rejects malformed JSON explicitly", async () => {
  const request = new Request("http://localhost/api/test", { method: "POST", body: "{" });
  await assert.rejects(readJsonBody(request), RequestBodyError);
});

test("request body reader requires an object when the route expects fields", async () => {
  const request = new Request("http://localhost/api/test", { method: "POST", body: "null" });
  await assert.rejects(readJsonObject(request), /请求体必须是 JSON 对象/);
});

test("route error mapping returns HTTP 400 for request body failures", async () => {
  const response = collectionError(new RequestBodyError("请求体必须是有效 JSON"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "请求体必须是有效 JSON" });
});
