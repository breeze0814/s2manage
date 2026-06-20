import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getSetting, setSetting } from "@/server/settings";
import {
  normalizeAccountBalanceAlertIntervalSeconds,
  normalizeUpstreamMonitorConcurrency,
  normalizeUpstreamMonitorTimeoutSeconds,
  normalizeWorkerIntervalSeconds,
} from "@/server/worker-settings";

export const appSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async () => ({
    workerIntervalSeconds: normalizeWorkerIntervalSeconds(await getSetting("worker_interval_seconds")),
    accountBalanceAlertIntervalSeconds: normalizeAccountBalanceAlertIntervalSeconds(await getSetting("account_balance_alert_interval_seconds")),
    upstreamMonitorTimeoutSeconds: normalizeUpstreamMonitorTimeoutSeconds(await getSetting("upstream_monitor_timeout_seconds")),
    upstreamMonitorConcurrency: normalizeUpstreamMonitorConcurrency(await getSetting("upstream_monitor_concurrency")),
  })),
  saveWorker: protectedProcedure
    .input(
      z.object({
        workerIntervalSeconds: z.number().int().min(60).max(24 * 60 * 60),
        accountBalanceAlertIntervalSeconds: z.number().int().min(60).max(24 * 60 * 60).optional(),
        upstreamMonitorTimeoutSeconds: z.number().int().min(10).max(5 * 60),
        upstreamMonitorConcurrency: z.number().int().min(1).max(20),
      }),
    )
    .mutation(async ({ input }) => {
      const workerIntervalSeconds = normalizeWorkerIntervalSeconds(input.workerIntervalSeconds);
      const accountBalanceAlertIntervalSeconds = normalizeAccountBalanceAlertIntervalSeconds(
        input.accountBalanceAlertIntervalSeconds,
        await getSetting("account_balance_alert_interval_seconds"),
      );
      const upstreamMonitorTimeoutSeconds = normalizeUpstreamMonitorTimeoutSeconds(input.upstreamMonitorTimeoutSeconds);
      const upstreamMonitorConcurrency = normalizeUpstreamMonitorConcurrency(input.upstreamMonitorConcurrency);

      await Promise.all([
        setSetting("worker_interval_seconds", String(workerIntervalSeconds)),
        setSetting("account_balance_alert_interval_seconds", String(accountBalanceAlertIntervalSeconds)),
        setSetting("upstream_monitor_timeout_seconds", String(upstreamMonitorTimeoutSeconds)),
        setSetting("upstream_monitor_concurrency", String(upstreamMonitorConcurrency)),
      ]);

      return {
        ok: true,
        workerIntervalSeconds,
        accountBalanceAlertIntervalSeconds,
        upstreamMonitorTimeoutSeconds,
        upstreamMonitorConcurrency,
      };
    }),
});
