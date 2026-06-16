import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { listSyncLogs } from "@/server/sync-logs";
import { workerRuntimeSettingsFromRows } from "@/server/worker-settings";

const workerOnlineGraceSeconds = 2 * 60;

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function secondsSince(date: Date | null) {
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
}

export const serviceStatusRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const selectedConnectionId = input?.connectionId;
      const checkedAt = new Date();

      const [
        settings,
        totalConnections,
        enabledConnections,
        autoConnections,
        blSiteStats,
        recentLogs,
        upstreamMonitorStats,
      ] = await Promise.all([
        db.setting.findMany({
          where: {
            key: {
              in: [
                "worker_heartbeat_at",
                "worker_started_at",
                "worker_last_run_started_at",
                "worker_last_run_finished_at",
                "worker_last_run_status",
                "worker_last_run_message",
                "worker_last_run_duration_ms",
                "worker_interval_seconds",
                "worker_next_run_at",
                "upstream_monitor_timeout_seconds",
                "upstream_monitor_concurrency",
              ],
            },
          },
        }),
        db.connection.count(),
        db.connection.count({ where: { enabled: true } }),
        db.connection.count({ where: { enabled: true, syncMode: "auto" } }),
        db.blCollectionSite.groupBy({
          by: ["enabled", "lastStatus"],
          _count: { _all: true },
          where: selectedConnectionId ? { connectionId: selectedConnectionId } : undefined,
        }),
        listSyncLogs({ connectionId: selectedConnectionId, limit: 10 }),
        db.upstreamMonitorRule.groupBy({
          by: ["enabled"],
          _count: { _all: true },
          where: selectedConnectionId ? { connectionId: selectedConnectionId } : undefined,
        }),
      ]);

      const settingMap = new Map(settings.map((row) => [row.key, row.value]));
      const heartbeatAt = parseDate(settingMap.get("worker_heartbeat_at"));
      const lastRunStartedAt = parseDate(settingMap.get("worker_last_run_started_at"));
      const lastRunFinishedAt = parseDate(settingMap.get("worker_last_run_finished_at"));
      const nextRunAt = parseDate(settingMap.get("worker_next_run_at"));
      const runtimeSettings = workerRuntimeSettingsFromRows(settings);
      const intervalSeconds = runtimeSettings.workerIntervalSeconds;
      const heartbeatAgeSeconds = secondsSince(heartbeatAt);
      const heartbeatOnline = heartbeatAgeSeconds !== null
        && heartbeatAgeSeconds <= Math.max(workerOnlineGraceSeconds, intervalSeconds * 2 + workerOnlineGraceSeconds);
      const scheduleOnline = nextRunAt !== null
        && Date.now() <= nextRunAt.getTime() + workerOnlineGraceSeconds * 1000;
      const workerOnline = heartbeatOnline || scheduleOnline;
      const recentLogItems = recentLogs.logs;
      const failedLogs = recentLogItems.filter((log) => log.status === "failed").length;
      const monitorRules = upstreamMonitorStats.reduce((total, row) => total + row._count._all, 0);
      const monitorEnabledRules = upstreamMonitorStats
        .filter((row) => row.enabled)
        .reduce((total, row) => total + row._count._all, 0);
      const blTotalSites = blSiteStats.reduce((total, row) => total + row._count._all, 0);
      const blEnabledSites = blSiteStats
        .filter((row) => row.enabled)
        .reduce((total, row) => total + row._count._all, 0);
      const blOnlineSites = blSiteStats
        .filter((row) => row.lastStatus === "online")
        .reduce((total, row) => total + row._count._all, 0);
      const blOfflineSites = blSiteStats
        .filter((row) => row.lastStatus === "offline")
        .reduce((total, row) => total + row._count._all, 0);

      let database = { ok: true, message: "数据库连接正常" };
      try {
        await db.$queryRaw`SELECT 1`;
      } catch (error) {
        database = { ok: false, message: error instanceof Error ? error.message : String(error) };
      }

      return {
        checkedAt,
        web: {
          ok: true,
          message: "Web 服务在线",
          nodeEnv: process.env.NODE_ENV ?? "development",
          uptimeSeconds: Math.round(process.uptime()),
        },
        database,
        worker: {
          online: workerOnline,
          heartbeatAt,
          heartbeatAgeSeconds,
          startedAt: parseDate(settingMap.get("worker_started_at")),
          lastRunStartedAt,
          lastRunFinishedAt,
          lastRunStatus: settingMap.get("worker_last_run_status") || null,
          lastRunMessage: settingMap.get("worker_last_run_message") || null,
          lastRunDurationMs: Number(settingMap.get("worker_last_run_duration_ms")) || null,
          intervalSeconds,
          upstreamMonitorTimeoutSeconds: runtimeSettings.upstreamMonitorTimeoutSeconds,
          upstreamMonitorConcurrency: runtimeSettings.upstreamMonitorConcurrency,
          nextRunAt,
        },
        bl: {
          configured: blEnabledSites > 0,
          totalSites: blTotalSites,
          enabledSites: blEnabledSites,
          onlineSites: blOnlineSites,
          offlineSites: blOfflineSites,
        },
        connections: {
          total: totalConnections,
          enabled: enabledConnections,
          auto: autoConnections,
        },
        upstreamMonitor: {
          rules: monitorRules,
          enabledRules: monitorEnabledRules,
        },
        recentLogs: {
          total: recentLogItems.length,
          failed: failedLogs,
          items: recentLogItems,
        },
      };
    }),
});
