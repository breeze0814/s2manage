export const LOTTERY_TIME_ZONE = "Asia/Shanghai" as const;

export type LotteryParticipationMode = "daily" | "once";

/** Returns the stable uniqueness key used for one user's participation window. */
export function lotteryParticipationKey(mode: LotteryParticipationMode, now: Date) {
  if (mode === "once") return "campaign";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: LOTTERY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function lotteryParticipationLabel(mode: LotteryParticipationMode) {
  return mode === "daily" ? "每日一次" : "活动期间一次";
}
