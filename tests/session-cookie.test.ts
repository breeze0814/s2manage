import assert from "node:assert/strict";
import { sessionCookieSecure } from "@/server/session-cookie";

function withEnv<T>(env: NodeJS.ProcessEnv, fn: () => T) {
  const previous = { ...process.env };
  process.env = { ...previous, ...env };
  try {
    return fn();
  } finally {
    process.env = previous;
  }
}

withEnv({ NODE_ENV: "development", S2A_SESSION_COOKIE_SECURE: "" }, () => {
  assert.equal(sessionCookieSecure(), false, "development HTTP should be allowed by default");
});

withEnv({ NODE_ENV: "production", S2A_SESSION_COOKIE_SECURE: "" }, () => {
  assert.equal(sessionCookieSecure(), false, "production HTTP should be allowed by default");
});

withEnv({ NODE_ENV: "production", S2A_SESSION_COOKIE_SECURE: "true" }, () => {
  assert.equal(sessionCookieSecure(), true, "secure cookies can be explicitly enabled for HTTPS-only deployments");
});
