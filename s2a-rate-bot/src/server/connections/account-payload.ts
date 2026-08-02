import type { UpstreamRecord } from "../upstream-platform/types.ts";
import type { ConnectionGroupType } from "./types.ts";

const HIGH_CONCURRENCY = 1_000;
const ANTIGRAVITY_CONCURRENCY = 10;

export function buildTargetAccountPayload(input: Readonly<{
  name: string;
  sourceBaseUrl: string;
  apiKey: string;
  groupType: ConnectionGroupType;
  targetGroupIds: readonly number[];
}>): UpstreamRecord {
  const credentials: UpstreamRecord = { base_url: input.sourceBaseUrl, api_key: input.apiKey };
  const payload: UpstreamRecord = {
    name: input.name, type: "apikey", platform: input.groupType, credentials,
    priority: 1, group_ids: [...input.targetGroupIds], concurrency: concurrency(input.groupType),
  };
  if (input.groupType === "openai" || input.groupType === "anthropic") {
    credentials.pool_mode = true;
    payload.extra = { [`${input.groupType}_passthrough`]: true };
  }
  if (input.groupType === "gemini") {
    credentials.pool_mode = true;
    credentials.tier_id = "aistudio_free";
  }
  return payload;
}

function concurrency(groupType: ConnectionGroupType) {
  if (groupType === "antigravity") return ANTIGRAVITY_CONCURRENCY;
  if (["openai", "anthropic", "gemini"].includes(groupType)) return HIGH_CONCURRENCY;
  return HIGH_CONCURRENCY;
}
