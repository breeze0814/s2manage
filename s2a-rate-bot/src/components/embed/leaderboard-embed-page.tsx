"use client";

import { CalendarRange, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Leaderboard } from "../../server/embeds/types";
import { LeaderboardTable } from "../engagement/leaderboard-table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { EmbedError, EmbedHeader, EmbedInlineError, EmbedLoading } from "./embed-state";
import { embedRequestJson, useEmbedSession } from "./use-embed-session";

export function LeaderboardEmbedPage() {
  const auth = useEmbedSession("leaderboard");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (auth.session) void load(auth.session.token, "", "", setData, setStartDate, setEndDate, setLoading, setError); }, [auth.session]);
  if (auth.loading) return <EmbedLoading />;
  if (auth.error || !auth.session) return <EmbedError message={auth.error || "嵌入会话不可用"} />;
  return <div className="min-h-dvh bg-background"><EmbedHeader eyebrow="Usage Board" title="用量排行榜" description="按 Token 用量查看活跃用户排名，邮箱已做隐私脱敏" />
    <div className="mx-auto max-w-6xl p-4 sm:p-6"><section className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[1fr_1fr_auto]"><DateField label="开始日期" value={startDate} onChange={setStartDate} /><DateField label="结束日期" value={endDate} onChange={setEndDate} />
        <Button type="button" className="self-end" disabled={loading || !startDate || !endDate} onClick={() => void load(auth.session!.token, startDate, endDate, setData, setStartDate, setEndDate, setLoading, setError)}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}查询</Button></div>
      {error ? <div className="m-4"><EmbedInlineError message={error} onRetry={() => void load(auth.session!.token, startDate, endDate, setData, setStartDate, setEndDate, setLoading, setError)} retryLabel="重新读取排行榜" /></div> : null}
      {loading && !data ? <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取排行榜…</div> : data ? <><div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs text-muted"><CalendarRange className="size-4" />{data.startDate} 至 {data.endDate} · 最多显示 50 名</div><LeaderboardTable data={data} /></> : null}
    </section></div>
  </div>;
}

function DateField({ label, value, onChange }: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) { return <Label><span className="mb-1.5 block">{label}</span><Input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></Label>; }

async function load(token: string, startDate: string, endDate: string, setData: (value: Leaderboard) => void, setStart: (value: string) => void, setEnd: (value: string) => void, setLoading: (value: boolean) => void, setError: (value: string) => void) {
  setLoading(true); setError(""); const query = startDate && endDate ? `?start_date=${startDate}&end_date=${endDate}` : "";
  try { const data = await embedRequestJson<Leaderboard>(`/api/embed/leaderboard${query}`, token); setData(data); setStart(data.startDate); setEnd(data.endDate); }
  catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  finally { setLoading(false); }
}
