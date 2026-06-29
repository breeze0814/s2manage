"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

export function BotWsAutoStarter({ connectionId }: { connectionId: number | null }) {
  const startWsListener = trpc.botSettings.startWsListener.useMutation();
  const { data: savedSettings } = trpc.botSettings.get.useQuery(
    { connectionId: connectionId ?? 0 },
    { enabled: Boolean(connectionId) },
  );
  const { data: wsLogs } = trpc.botSettings.wsLogs.useQuery(
    { connectionId: connectionId ?? 0 },
    { enabled: Boolean(connectionId) },
  );
  const startedForConnection = useRef<number | null>(null);

  useEffect(() => {
    startedForConnection.current = null;
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId || !savedSettings) return;
    if (startedForConnection.current === connectionId) return;
    if (!savedSettings.enabled || !savedSettings.wsUrl.trim()) return;
    if (wsLogs?.running || wsLogs?.connected) {
      startedForConnection.current = connectionId;
      return;
    }

    startedForConnection.current = connectionId;
    startWsListener.mutate({ connectionId });
  }, [connectionId, savedSettings, startWsListener, wsLogs?.connected, wsLogs?.running]);

  return null;
}
