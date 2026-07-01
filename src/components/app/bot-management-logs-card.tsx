"use client";

import type { RefObject } from "react";
import { PauseCircle, Play, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QqBotWsLog } from "@/components/app/bot-management-panel-parts";

export function WsLogsCard({
  botLabel,
  connected,
  listenerBadgeText,
  listenerBadgeVariant,
  listenerStartedAtText,
  listenerStatusText,
  logContainerRef,
  logs,
  napLinkState,
  onStart,
  onStop,
  running,
  startDisabled,
  startPending,
  stopPending,
  wsUrl,
}: {
  botLabel: string;
  connected: boolean;
  listenerBadgeText: string;
  listenerBadgeVariant: "success" | "destructive" | "secondary";
  listenerStartedAtText: string;
  listenerStatusText: string;
  logContainerRef: RefObject<HTMLDivElement>;
  logs: QqBotWsLog[];
  napLinkState: string;
  onStart: () => void;
  onStop: () => void;
  running: boolean;
  startDisabled: boolean;
  startPending: boolean;
  stopPending: boolean;
  wsUrl: string;
}) {
  return (
    <Card data-layout="botLogsRightColumn">
      <CardHeader className="px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radio className="size-4 text-primary" />
              WS 实时日志
            </CardTitle>
            <Badge variant={listenerBadgeVariant}>{listenerBadgeText}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onStart} disabled={startDisabled} title="开始监听 NapCat WebSocket 事件">
              <Play className="size-4" />
              {startPending ? "启动中..." : "开始监听"}
            </Button>
            <Button variant="outline" size="sm" onClick={onStop} disabled={stopPending || !running} title="停止监听 NapCat WebSocket 事件">
              <PauseCircle className="size-4" />
              {stopPending ? "停止中..." : "停止监听"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="mb-2 grid gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs text-muted-foreground sm:grid-cols-2">
          <StatusItem label="当前 WS 状态" value={listenerStatusText} />
          <StatusItem label="NapLink" value={`${napLinkState}${connected ? " / 已连接" : ""}`} />
          <StatusItem label="Bot QQ" value={botLabel} title={botLabel} />
          <StatusItem label="地址" value={wsUrl || "-"} title={wsUrl} />
          <StatusItem label="启动时间" value={listenerStartedAtText} title={listenerStartedAtText} />
        </div>
        <div ref={logContainerRef} className="max-h-[620px] min-h-[420px] overflow-auto rounded-md border border-border/70 bg-slate-950 px-3 py-2 font-mono text-xs leading-6 text-slate-100 dark:bg-black/40">
          {logs.map((log, index) => (
            <div key={`${log.time}-${log.type}-${index}`} className="grid gap-2 border-b border-white/10 py-1 last:border-b-0 sm:grid-cols-[72px_132px_minmax(0,1fr)]">
              <span className="text-slate-400">{log.time}</span>
              <span className="text-sky-300">{log.type}</span>
              <span className="min-w-0 break-words">{log.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, title, value }: { label: string; title?: string; value: string }) {
  return (
    <div className="min-w-0 truncate" title={title ?? value}>
      <span className="text-foreground">{label}：</span>
      <span>{value}</span>
    </div>
  );
}
