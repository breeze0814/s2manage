import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotificationDispatcher } from "../src/server/notifications/dispatcher.ts";
import type { NotificationChannelSettings } from "../src/server/notifications/types.ts";
import type { JsonRequest } from "../src/adapters/http-client.ts";

const settings: NotificationChannelSettings = {
  dingtalk: [{ id: "ding", name: "Ding", enabled: true, webhook: "https://example.test/ding", secret: "secret" }],
  wecom: [], qq: [], feishu: [], telegram: [],
};

test("notification dispatcher signs DingTalk and fans out enabled channels", async () => {
  const requests: JsonRequest[] = [];
  const dispatcher = createNotificationDispatcher({
    settings: async () => settings,
    timeoutMs: async () => 1000,
    proxyUrl: async () => null,
    request: async <T>(request: JsonRequest) => { requests.push(request); return { errcode: 0, ok: true } as T; },
  });
  const result = await dispatcher.send("hello");
  assert.deepEqual(result, { sent: 1, failed: [] });
  assert.match(requests[0]?.url ?? "", /timestamp=\d+&sign=/);
  assert.deepEqual(requests[0]?.body, { msgtype: "text", text: { content: "hello" } });
});

test("notification dispatcher caches QQ access tokens", async () => {
  const qq: NotificationChannelSettings = { dingtalk: [], wecom: [], feishu: [], telegram: [], qq: [{ id: "qq", name: "QQ", enabled: true, appId: "app", clientSecret: "secret", userOpenId: "user" }] };
  let tokenCalls = 0;
  const dispatcher = createNotificationDispatcher({ settings: async () => qq, timeoutMs: async () => 1000, proxyUrl: async () => null,
    request: async <T>(request: JsonRequest) => {
      if (request.url.includes("getAppAccessToken")) { tokenCalls += 1; return { access_token: "token", expires_in: 7200 } as T; }
      return { code: 0 } as T;
    } });
  await dispatcher.send("one");
  await dispatcher.send("two");
  assert.equal(tokenCalls, 1);
});
