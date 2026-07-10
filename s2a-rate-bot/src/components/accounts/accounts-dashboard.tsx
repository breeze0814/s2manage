"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { TargetAccountView } from "./types";
import { useAccountsDashboard } from "./use-accounts-dashboard";

export function AccountsDashboard() {
  const view = useAccountsDashboard();
  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-xl font-semibold tracking-tight">账号调度</h1><p className="mt-1 text-sm text-slate-600">账号状态始终来自目标站；本地不保存账号快照。</p></div>
        <button type="button" onClick={view.refresh} disabled={view.loading} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50">
          {view.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}刷新目标站账号
        </button>
      </header>
      {view.message ? <p role="status" aria-live="polite" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{view.message}</p> : null}
      {view.loading ? <LoadingAccounts /> : <AccountList accounts={view.accounts} pendingId={view.pendingId} onToggle={view.setSchedulable} />}
    </section>
  );
}

function AccountList({ accounts, pendingId, onToggle }: Readonly<{ accounts: readonly TargetAccountView[]; pendingId: number | null; onToggle: (account: TargetAccountView) => void }>) {
  if (accounts.length === 0) return <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">目标站没有返回账号，或尚未完成全局配置。</p>;
  return (
    <>
      <div className="space-y-3 md:hidden">{accounts.map((account) => <AccountCard key={account.id} account={account} pending={pendingId === account.id} onToggle={onToggle} />)}</div>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block"><table className="w-full text-left text-sm"><AccountHead /><tbody>{accounts.map((account) => <AccountRow key={account.id} account={account} pending={pendingId === account.id} onToggle={onToggle} />)}</tbody></table></div>
    </>
  );
}

function AccountHead() {
  return <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">账号</th><th className="p-3">平台</th><th className="p-3">状态</th><th className="p-3">分组</th><th className="p-3">优先级 / 倍率</th><th className="p-3 text-right">参与调度</th></tr></thead>;
}

function AccountRow(props: AccountActionProps) {
  const { account } = props;
  return <tr className="border-t border-slate-200"><td className="p-3"><p className="font-medium">{account.name}</p><p className="text-xs tabular-nums text-slate-500">ID {account.id}</p></td><td className="p-3">{account.platform}</td><td className="p-3"><StatusBadge status={account.status} /></td><td className="p-3"><GroupIds ids={account.groupIds} /></td><td className="p-3 tabular-nums">{account.priority ?? "-"} / {account.rateMultiplier ?? "-"}</td><td className="p-3"><div className="flex justify-end"><ScheduleSwitch {...props} /></div></td></tr>;
}

function AccountCard(props: AccountActionProps) {
  const { account } = props;
  return <article className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{account.name}</h2><p className="text-xs text-slate-500">{account.platform} · ID {account.id}</p></div><StatusBadge status={account.status} /></div><dl className="grid grid-cols-2 gap-3 text-sm"><Info label="分组"><GroupIds ids={account.groupIds} /></Info><Info label="优先级 / 倍率"><span className="tabular-nums">{account.priority ?? "-"} / {account.rateMultiplier ?? "-"}</span></Info></dl><div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-sm text-slate-600">参与调度</span><ScheduleSwitch {...props} /></div></article>;
}

function ScheduleSwitch({ account, pending, onToggle }: AccountActionProps) {
  return <button type="button" role="switch" aria-checked={account.schedulable} aria-label={`${account.name}参与调度`} disabled={pending} onClick={() => onToggle(account)} className={`flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50 ${account.schedulable ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{pending ? <Loader2 className="size-4 animate-spin" /> : <span aria-hidden="true" className={`size-2 rounded-full ${account.schedulable ? "bg-emerald-600" : "bg-slate-400"}`} />}{account.schedulable ? "已参与" : "已暂停"}</button>;
}

function StatusBadge({ status }: Readonly<{ status: string }>) { const active = status === "active"; return <span className={`rounded-full px-2 py-1 text-xs ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{active ? "正常" : status}</span>; }
function GroupIds({ ids }: Readonly<{ ids: readonly number[] }>) { return ids.length ? <span className="flex flex-wrap gap-1">{ids.map((id) => <span key={id} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-700">#{id}</span>)}</span> : <span className="text-slate-400">-</span>; }
function Info({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <div><dt className="mb-1 text-xs text-slate-500">{label}</dt><dd>{children}</dd></div>; }
function LoadingAccounts() { return <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />正在请求目标站账号...</div>; }
type AccountActionProps = { readonly account: TargetAccountView; readonly pending: boolean; readonly onToggle: (account: TargetAccountView) => void };
