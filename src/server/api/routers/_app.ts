import { createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { connectionsRouter } from "@/server/api/routers/connections";
import { groupsRouter } from "@/server/api/routers/groups";
import { blRouter } from "@/server/api/routers/bl";
import { accountsRouter } from "@/server/api/routers/accounts";
import { announcementsRouter } from "@/server/api/routers/announcements";
import { siteSettingsRouter } from "@/server/api/routers/site-settings";
import { syncRouter } from "@/server/api/routers/sync";
import { appSettingsRouter } from "@/server/api/routers/app-settings";
import { upstreamMonitorRouter } from "@/server/api/routers/upstream-monitor";
import { serviceStatusRouter } from "@/server/api/routers/service-status";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  connections: connectionsRouter,
  groups: groupsRouter,
  bl: blRouter,
  accounts: accountsRouter,
  announcements: announcementsRouter,
  siteSettings: siteSettingsRouter,
  sync: syncRouter,
  appSettings: appSettingsRouter,
  upstreamMonitor: upstreamMonitorRouter,
  serviceStatus: serviceStatusRouter,
});

export type AppRouter = typeof appRouter;
