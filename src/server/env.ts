export function appSecret() {
  const secret = process.env.APP_SECRET;
  if (secret && secret.length >= 24) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set in production");
  return "dev-secret-change-before-production-24";
}

export function encryptionKey(): Buffer {
  const configured = process.env.ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be base64 32-byte key");
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY must be set in production");
  return Buffer.from("dev-encryption-key-32-bytes-0000", "utf8");
}
