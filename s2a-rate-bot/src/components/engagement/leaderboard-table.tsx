import { Crown, Medal, Trophy } from "lucide-react";
import type { Leaderboard } from "../../server/embeds/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export function LeaderboardTable({ data }: Readonly<{ data: Leaderboard }>) {
  if (!data.rows.length) return <div className="empty-state m-4"><Trophy className="size-7" /><span>所选时间范围暂无用量数据</span></div>;
  return (
    <>
      <div className="divide-y divide-border md:hidden">{data.rows.map((row) => <LeaderboardMobileRow key={row.userId} row={row} current={data.currentUserId === row.userId} />)}</div>
      <div className="hidden overflow-auto md:block">
        <Table className="min-w-[680px]">
          <TableHeader><TableRow><TableHead className="w-20">排名</TableHead><TableHead>用户</TableHead><TableHead className="text-right">请求数</TableHead><TableHead className="text-right">Token</TableHead><TableHead className="text-right">实际消费</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.map((row) => {
            const current = data.currentUserId === row.userId;
            return <TableRow key={row.userId} data-selected={current}><TableCell><Rank rank={row.rank} /></TableCell><TableCell><span className="font-medium">{row.email || `用户 ${row.userId}`}</span>{current ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary-strong">你</span> : null}</TableCell>
              <TableCell className="text-right tabular-nums">{row.requests.toLocaleString("zh-CN")}</TableCell><TableCell className="text-right tabular-nums">{row.totalTokens.toLocaleString("zh-CN")}</TableCell><TableCell className="text-right font-medium tabular-nums">{row.actualCost.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}</TableCell></TableRow>;
          })}</TableBody>
        </Table>
      </div>
    </>
  );
}

function LeaderboardMobileRow({ row, current }: Readonly<{ row: Leaderboard["rows"][number]; current: boolean }>) {
  const label = row.email || `用户 ${row.userId}`;
  return <article data-selected={current} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 data-[selected=true]:bg-primary/[0.08]">
    <div className="row-span-2 pt-0.5"><Rank rank={row.rank} /></div><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><span className="truncate font-medium" title={label}>{label}</span>{current ? <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary-strong">你</span> : null}</div><p className="mt-1 text-xs text-muted">第 {row.rank} 名</p></div>
    <dl className="col-span-2 grid grid-cols-3 divide-x divide-border border-t border-border pt-2"><LeaderboardMetric label="请求" value={row.requests.toLocaleString("zh-CN")} /><LeaderboardMetric label="Token" value={row.totalTokens.toLocaleString("zh-CN")} /><LeaderboardMetric label="消费" value={row.actualCost.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} /></dl>
  </article>;
}

function LeaderboardMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0"><dt className="truncate text-[11px] text-muted">{label}</dt><dd className="mt-1 truncate text-right text-sm font-medium tabular-nums" title={value}>{value}</dd></div>;
}

function Rank({ rank }: Readonly<{ rank: number }>) {
  if (rank === 1) return <span className="inline-flex size-9 items-center justify-center rounded-full bg-warning/10 text-warning"><Crown className="size-4" aria-label="第 1 名" /></span>;
  if (rank <= 3) return <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary-strong"><Medal className="size-4" aria-label={`第 ${rank} 名`} /></span>;
  return <span className="inline-flex size-9 items-center justify-center text-sm font-semibold tabular-nums text-muted">{rank}</span>;
}
