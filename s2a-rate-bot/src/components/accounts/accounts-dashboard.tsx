"use client";

import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { PlatformLabel } from "../platform-icon";
import { Tag } from "../ui/tag";
import type { AccountGroupOption, TargetAccountView } from "./types";
import { useAccountsDashboard } from "./use-accounts-dashboard";

export function AccountsDashboard() {
  const view = useAccountsDashboard();
  return (
    <section className="page-stack">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-heading">Account Pool</h1><p className="page-description">号池管理</p></div>
        <button type="button" onClick={view.refresh} disabled={view.loading} className="secondary-button shrink-0">
          {view.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新账号
        </button>
      </header>
      {view.loading ? <LoadingAccounts /> : <AccountList accounts={view.accounts} groups={view.groups} pendingId={view.pendingId} onToggle={view.setSchedulable} />}
    </section>
  );
}

function AccountList({ accounts, groups, pendingId, onToggle }: Readonly<{ accounts: readonly TargetAccountView[]; groups: readonly AccountGroupOption[]; pendingId: number | null; onToggle: (account: TargetAccountView) => void }>) {
  if (accounts.length === 0) return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-8 text-center text-sm text-muted">目标站没有返回账号，或尚未完成全局配置。</p>;
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">{accounts.map((account) => <AccountCard key={account.id} account={account} groups={groupMap} pending={pendingId === account.id} onToggle={onToggle} />)}</div>
      <div className="table-shell hidden md:block"><table className="data-table"><AccountHead /><tbody>{accounts.map((account) => <AccountRow key={account.id} account={account} groups={groupMap} pending={pendingId === account.id} onToggle={onToggle} />)}</tbody></table></div>
    </div>
  );
}

function AccountHead() {
  return <thead><tr><th>ID</th><th>账号</th><th>平台</th><th>状态</th><th>分组</th><th>优先级 / 倍率</th><th className="text-right">参与调度</th></tr></thead>;
}

function AccountRow(props: AccountActionProps) {
  const { account } = props;
  return <tr><td className="font-mono text-sm tabular-nums text-muted">#{account.id}</td><td><p className="font-medium">{account.name}</p></td><td><Tag><PlatformLabel platform={account.platform} /></Tag></td><td><StatusBadge status={account.status} /></td><td><GroupIds ids={account.groupIds} groups={props.groups} /></td><td><AccountMetrics account={account} /></td><td><div className="flex justify-end"><ScheduleSwitch {...props} /></div></td></tr>;
}

function AccountCard(props: AccountActionProps) {
  const { account } = props;
  return <article className="panel space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium" title={account.name}>{account.name}</h2><div className="mt-1 flex flex-wrap items-center gap-1.5"><Tag><PlatformLabel platform={account.platform} /></Tag><Tag>#{account.id}</Tag></div></div><StatusBadge status={account.status} /></div><dl className="grid gap-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"><Info label="所属分组"><GroupIds ids={account.groupIds} groups={props.groups} /></Info><Info label="优先级 / 倍率"><AccountMetrics account={account} /></Info></dl><div className="flex items-center justify-between border-t border-border pt-3"><span className="text-sm text-muted">参与调度</span><ScheduleSwitch {...props} /></div></article>;
}

function AccountMetrics({ account }: Readonly<{ account: TargetAccountView }>) {
  return <span className="font-mono font-semibold tabular-nums"><span>{account.priority ?? "-"}</span><span className="px-1 text-muted">/</span><span className="text-rate">{account.rateMultiplier ?? "-"}</span></span>;
}

function ScheduleSwitch({ account, pending, onToggle }: AccountActionProps) {
  const label = account.schedulable ? "暂停调度" : "参与调度";
  return <button type="button" role="switch" aria-checked={account.schedulable} aria-label={`${account.name}${label}`} title={label} disabled={pending} onClick={() => onToggle(account)} className={`flex size-11 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${account.schedulable ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "border-border bg-surface-muted text-muted"}`}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : account.schedulable ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}</button>;
}

function StatusBadge({ status }: Readonly<{ status: string }>) { const active = status === "active"; return <Tag tone={active ? "success" : "neutral"}>{active ? "正常" : status}</Tag>; }
function GroupIds({ ids, groups }: Readonly<{ ids: readonly number[]; groups: ReadonlyMap<number, AccountGroupOption> }>) { return ids.length ? <span className="flex flex-wrap gap-1.5">{ids.map((id) => <GroupTag key={id} id={id} group={groups.get(id)} />)}</span> : <span className="text-muted">-</span>; }
function GroupTag({ id, group }: Readonly<{ id: number; group?: AccountGroupOption }>) { return <Tag tone={group ? "neutral" : "warning"} title={group?.name}><span className="max-w-32 truncate text-foreground">{group?.name ?? "未知分组"}</span><span className="tabular-nums">#{id}</span><span className="font-mono font-semibold tabular-nums text-rate">×{formatRate(group?.rate_multiplier)}</span></Tag>; }
function formatRate(value: number | null | undefined) { return value === null || value === undefined ? "-" : String(value); }
function Info({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) { return <div><dt className="mb-1 text-xs text-muted">{label}</dt><dd>{children}</dd></div>; }
function LoadingAccounts() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取本地账号快照...</div>; }
type AccountActionProps = { readonly account: TargetAccountView; readonly groups: ReadonlyMap<number, AccountGroupOption>; readonly pending: boolean; readonly onToggle: (account: TargetAccountView) => void };
