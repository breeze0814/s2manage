import { formatRateMultiplier } from "../core/rates.ts";
import type { RateGroupSnapshot } from "./command.ts";

export function buildRateChangeMessage(input: {
  readonly groupName: string;
  readonly oldRate: number | null;
  readonly newRate: number;
  readonly groups: readonly RateGroupSnapshot[];
  readonly generatedAt?: Date;
}) {
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("zh-CN", { hour12: false });
  const lines = [
    "分组倍率已更新",
    `变动分组：${input.groupName} ${formatNullableRate(input.oldRate)} -> ${formatRateMultiplier(input.newRate)}`,
    "",
    "当前分组倍率：",
  ];
  lines.push(...input.groups.map((group) => `- ${group.name}：${formatRateMultiplier(group.rateMultiplier)}`));
  lines.push(`更新时间：${generatedAt}`);
  return lines.join("\n");
}

function formatNullableRate(value: number | null) {
  return value === null ? "-" : formatRateMultiplier(value);
}
