export function sessionCookieSecure() {
  return process.env.S2A_SESSION_COOKIE_SECURE === "true";
}
