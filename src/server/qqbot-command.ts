function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractQqBotCommandText(text: string, botUserId: string) {
  const targetBotUserId = botUserId.trim();
  const normalizedText = text.trim();
  if (!targetBotUserId || !normalizedText) return null;

  const pattern = new RegExp(`^\\[CQ:at,qq=${escapeRegExp(targetBotUserId)}\\]\\s*([\\s\\S]*)$`, "u");
  const match = pattern.exec(normalizedText);
  if (!match) return null;
  return (match[1] ?? "").trim();
}
