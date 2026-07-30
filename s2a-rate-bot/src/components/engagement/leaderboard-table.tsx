import { Crown, Medal, Trophy } from "lucide-react";
import type { Leaderboard } from "../../server/embeds/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export function LeaderboardTable({ data }: Readonly<{ data: Leaderboard }>) {
  if (!data.rows.length) return <div className="empty-state m-4"><Trophy className="size-7" /><span>所选时间范围暂无用量数据</span></div>;
  return (
    <div className="overflow-auto">
      <Table className="min-w-[680px]">
        <TableHeader><TableRow><TableHead className="w-20">排名</TableHead><TableHead>用户</TableHead><TableHead className="text-right">请求数</TableHead><TableHead className="text-right">Token</TableHead><TableHead className="text-right">实际消费</TableHead></TableRow></TableHeader>
        <TableBody>{data.rows.map((row) => {
          const current = data.currentUserId === row.userId;
          return <TableRow key={row.userId} data-selected={current}><TableCell><Rank rank={row.rank} /></TableCell><TableCell><span className="font-medium">{row.email || `用户 ${row.userId}`}</span>{current ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary-strong">你</span> : null}</TableCell>
            <TableCell className="text-right tabular-nums">{row.requests.toLocaleString("zh-CN")}</TableCell><TableCell className="text-right tabular-nums">{row.totalTokens.toLocaleString("zh-CN")}</TableCell><TableCell className="text-right font-medium tabular-nums">{row.actualCost.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}</TableCell></TableRow>;
        })}</TableBody>
      </Table>
    </div>
  );
}

function Rank({ rank }: Readonly<{ rank: number }>) {
  if (rank === 1) return <span className="inline-flex size-9 items-center justify-center rounded-full bg-warning/10 text-warning"><Crown className="size-4" aria-label="第 1 名" /></span>;
  if (rank <= 3) return <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary-strong"><Medal className="size-4" aria-label={`第 ${rank} 名`} /></span>;
  return <span className="inline-flex size-9 items-center justify-center text-sm font-semibold tabular-nums text-muted">{rank}</span>;
}
