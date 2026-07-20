import type { TextHttpClient } from "../../adapters/http-client.ts";
import { parseTargetAccountTestResponse } from "./test-result.ts";

const ACCOUNT_TEST_TIMEOUT_MS = 120_000;

export async function testTargetAccountChannel(input: Readonly<{
  accountId: number;
  baseUrl: string;
  adminApiKey: string;
  http: TextHttpClient;
}>) {
  const startedAt = Date.now();
  const response = await input.http.requestText({
    url: `${input.baseUrl.replace(/\/+$/, "")}/api/v1/admin/accounts/${input.accountId}/test`,
    method: "POST",
    headers: {
      "x-api-key": input.adminApiKey,
      accept: "text/event-stream, application/json",
      "content-type": "application/json; charset=utf-8",
    },
    body: {},
    timeoutMs: ACCOUNT_TEST_TIMEOUT_MS,
  });
  return parseTargetAccountTestResponse(response.text, Date.now() - startedAt);
}
