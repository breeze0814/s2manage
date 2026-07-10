import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const FORMAT_PREFIX = "enc:v1";
const MIN_SECRET_LENGTH = 24;
const IV_BYTES = 12;

export type SecretCipher = {
  readonly encrypt: (plainText: string) => string;
  readonly decrypt: (cipherText: string) => string;
};

export function createAesGcmSecretCipher(secret: string): SecretCipher {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`APP_SECRET must contain at least ${MIN_SECRET_LENGTH} characters`);
  }
  const key = createHash("sha256").update(secret).digest();
  return {
    encrypt: (plainText) => encryptValue(plainText, key),
    decrypt: (cipherText) => decryptValue(cipherText, key),
  };
}

function encryptValue(plainText: string, key: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return [FORMAT_PREFIX, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptValue(cipherText: string, key: Buffer) {
  const parts = cipherText.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== FORMAT_PREFIX) {
    throw new Error("Encrypted secret format is invalid or unsupported");
  }
  const iv = Buffer.from(parts[2] ?? "", "base64");
  const authTag = Buffer.from(parts[3] ?? "", "base64");
  const encrypted = Buffer.from(parts[4] ?? "", "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
