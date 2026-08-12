"use client";

import { CalendarRange, Loader2, Medal, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Leaderboard } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { DataLoadError } from "../ui/data-load-error";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { requestJson } from "./api";
import { EngagementPageHeader } from "./engagement-page-header";
import { LeaderboardTable } from "./leaderboard-table";

export function LeaderboardDashboard() {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => void loadLeaderboard({ startDate, endDate, setData, setStartDate, setEndDate, setLoading, setError });
  useEffect(() => { void loadLeaderboard({ startDate: "", endDate: "", setData, setStartDate, setEndDate, setLoading, setError }); }, []);
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="leaderboard" title="用户排行榜" description="按 Token 用量查看活跃用户，数据直接来自当前 Sub2API 目标站。" />
      <section className="panel overflow-hidden">
        <div className="panel-header">
          <div><h2 className="panel-title">统计周期</h2><p className="panel-description">结束日期不包含当日，最长可查询 31 天</p></div>
          <CalendarRange className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] lg:p-5">
          <DateField id="leaderboard-start" label="开始日期" value={startDate} onChange={setStartDate} />
          <DateField id="leaderboard-end" label="结束日期" value={endDate} onChange={setEndDate} />
          <Button type="button" className="self-end" disabled={loading || !startDate || !endDate} onClick={load}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}查询
          </Button>
        </div>
      </section>
      {error && !data ? <DataLoadError message={`排行榜加载失败：${error}`} onRetry={load} pending={loading} className="min-h-36 justify-center" /> : null}
      {error && data ? <DataLoadError message={`排行榜刷新失败：${error}`} onRetry={load} pending={loading} /> : null}
      {data?.rows.length ? <LeaderboardHighlights data={data} /> : null}
      {data || loading ? <section className="panel overflow-hidden"><div className="panel-header"><div><h2 className="panel-title">完整排名</h2><p className="panel-description">按照 Token 总用量从高到低排序</p></div></div>
        {loading && !data ? <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取排行榜…</div> : data ? <LeaderboardTable data={data} /> : null}
      </section> : null}
    </section>
  );
}

function LeaderboardHighlights({ data }: Readonly<{ data: Leaderboard }>) {
  return <section aria-label="排行榜前三名" className="grid gap-3 md:grid-cols-3">{data.rows.slice(0, 3).map((row) => <article key={row.userId} className="metric-card"><div className="flex items-center justify-between gap-3"><span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><Medal className="size-4" aria-hidden="true" /></span><span className="text-sm font-semibold text-muted">第 {row.rank} 名</span></div><p className="mt-3 truncate font-semibold" title={row.email}>{row.email || `用户 ${row.userId}`}</p><p className="mt-1 text-sm text-muted"><span className="font-semibold tabular-nums text-foreground">{row.totalTokens.toLocaleString("zh-CN")}</span> Token</p></article>)}</section>;
}

function DateField({ id, label, value, onChange }: Readonly<{ id: string; label: string; value: string; onChange: (value: string) => void }>) {
  return <Label htmlFor={id} className="block"><span className="mb-1.5 block">{label}</span><Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></Label>;
}

async function loadLeaderboard(input: Readonly<{
  startDate: string; endDate: string; setData: (value: Leaderboard) => void;
  setStartDate: (value: string) => void; setEndDate: (value: string) => void; setLoading: (value: boolean) => void; setError: (value: string) => void;
}>) {
  input.setLoading(true);
  input.setError("");
  const query = input.startDate && input.endDate ? `?start_date=${input.startDate}&end_date=${input.endDate}` : "";
  try {
    const data = await requestJson<Leaderboard>(`/api/leaderboard${query}`);
    input.setData(data); input.setStartDate(data.startDate); input.setEndDate(data.endDate);
  } catch (error) { const message = error instanceof Error ? error.message : String(error); input.setError(message); toast.error(message); }
  finally { input.setLoading(false); }
}
