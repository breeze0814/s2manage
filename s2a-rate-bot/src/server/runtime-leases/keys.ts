export const OPERATION_LEASE_DURATION_MS = 5 * 60 * 1_000;

export function targetScheduleLeaseKey(accountId: number) {
  return `target-schedule:${accountId}`;
}
