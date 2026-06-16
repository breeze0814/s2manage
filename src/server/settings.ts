import { db } from "@/server/db";
import { decrypt, encrypt } from "@/server/crypto";

const SECRET_PREFIX = "enc:";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export function decodeSecretSettingValue(value: string): string {
  if (!value.startsWith(SECRET_PREFIX)) return value;
  return decrypt(value.slice(SECRET_PREFIX.length));
}

export async function getSecretSetting(key: string, fallback = ""): Promise<string> {
  const value = await getSetting(key, fallback);
  return value ? decodeSecretSettingValue(value) : fallback;
}

export async function setSecretSetting(key: string, value: string): Promise<void> {
  await setSetting(key, `${SECRET_PREFIX}${encrypt(value)}`);
}
