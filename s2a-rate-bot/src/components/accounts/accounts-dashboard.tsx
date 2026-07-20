"use client";

import { CirclePlay, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { PlatformLabel } from "../platform-icon";
import { Tag, type TagTone } from "../ui/tag";
import { AccountBindingDialog, AccountBindingSummary } from "./account-binding-dialog";
import type {
  AccountGroupOption, AccountSourceBinding, AccountSourceRate, AccountSourceSite,
  AccountTestState, TargetAccountView,
} from "./types";
import { useAccountsDashboard } from "./use-accounts-dashboard";

export function AccountsDashboard() {
  const view = useAccountsDashboard();
  const testing = view.testPendingIds.length > 0;
  return <section className="page-stack">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="page-heading">Account Pool</h1><p className="page-description">号池管理</p></div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button type="button" onClick={view.testAll} disabled={view.loading || testing || view.accounts.length === 0} className="secondary-button shrink-0">
          {view.batchTesting ? <Loader2 className="size-3.5 animate-spin" /> : <ListChecks className="size-3.5" />}批量测试
        </button>
        <button type="button" onClick={view.refresh} disabled={view.loading || testing} className="secondary-button shrink-0">
          {view.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新账号
        </button>
      </div>
    </header>
    {view.loading ? <LoadingAccounts /> : <AccountList accounts={view.accounts} groups={view.groups} rates={view.rates} sites={view.sites}
      testPendingIds={view.testPendingIds} bindingPendingId={view.bindingPendingId} onBind={view.bindSource} onTest={view.testChannel} />}
  </section>;
}

function AccountList(input: AccountListProps) {
  if (input.accounts.length === 0) return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-8 text-center text-sm text-muted">目标站没有返回账号，或尚未完成全局配置。</p>;
  const groupMap = new Map(input.groups.map((group) => [group.id, group]));
  const actionProps = (account: TargetAccountView): AccountActionProps => ({
    account, groups: groupMap, rates: input.rates, sites: input.sites,
    testing: input.testPendingIds.includes(account.id), bindingPending: input.bindingPendingId === account.id,
    bindingDisabled: input.bindingPendingId !== null,
    onBind: input.onBind, onTest: input.onTest,
  });
  return <div className="space-y-3">
    <div className="space-y-3 md:hidden">{input.accounts.map((account) => <AccountCard key={account.id} {...actionProps(account)} />)}</div>
    <div className="hidden overflow-x-auto md:block"><div className="table-shell min-w-[1220px]"><table className="data-table"><AccountHead /><tbody>{input.accounts.map((account) => <AccountRow key={account.id} {...actionProps(account)} />)}</tbody></table></div></div>
  </div>;
}

function AccountHead() {
  return <thead><tr><th>ID</th><th>账号</th><th>平台</th><th>账号状态</th><th>目标分组</th><th>优先级 / 倍率</th><th>倍率采集绑定</th><th>测试状态</th><th className="text-right">操作</th></tr></thead>;
}

function AccountRow(props: AccountActionProps) {
  const { account } = props;
  return <tr><td className="font-mono text-sm tabular-nums text-muted">#{account.id}</td><td><p className="font-medium">{account.name}</p></td><td><Tag><PlatformLabel platform={account.platform} /></Tag></td><td><StatusBadge status={account.status} /></td><td><GroupIds ids={account.groupIds} groups={props.groups} /></td><td><AccountMetrics account={account} /></td><td><AccountBindingCell {...props} /></td><td><TestStatus test={account.lastTest} pending={props.testing} /></td><td><AccountActions {...props} /></td></tr>;
}

function AccountCard(props: AccountActionProps) {
  const { account } = props;
  return <article className="panel space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium" title={account.name}>{account.name}</h2><div className="mt-1 flex flex-wrap items-center gap-1.5"><Tag><PlatformLabel platform={account.platform} /></Tag><Tag>#{account.id}</Tag></div></div><StatusBadge status={account.status} /></div><dl className="grid gap-4 text-sm sm:grid-cols-2"><Info label="目标分组"><GroupIds ids={account.groupIds} groups={props.groups} /></Info><Info label="优先级 / 倍率"><AccountMetrics account={account} /></Info><Info label="倍率采集绑定" wide><AccountBindingCell {...props} /></Info><Info label="测试状态"><TestStatus test={account.lastTest} pending={props.testing} /></Info></dl><div className="flex items-center justify-between border-t border-border pt-3"><span className="text-sm text-muted">操作</span><AccountActions {...props} /></div></article>;
}

function AccountBindingCell(props: AccountActionProps) {
  return <div className="min-w-44 max-w-64">
    <AccountBindingSummary account={props.account} rates={props.rates} sites={props.sites} />
  </div>;
}

function AccountActions(props: AccountActionProps) {
  return <div className="flex items-center justify-end gap-2">
    <AccountBindingDialog account={props.account} rates={props.rates} sites={props.sites} pending={props.bindingPending}
      disabled={props.bindingDisabled} onSave={(binding) => props.onBind(props.account, binding)} />
    <TestChannelButton {...props} />
  </div>;
}

function AccountMetrics({ account }: Readonly<{ account: TargetAccountView }>) {
  return <span className="font-mono font-semibold tabular-nums"><span>{account.priority ?? "-"}</span><span className="px-1 text-muted">/</span><span className="text-rate">{account.rateMultiplier ?? "-"}</span></span>;
}

function TestChannelButton({ account, testing, onTest }: AccountActionProps) {
  const label = `测试 ${account.name} 的通道可用性`;
  return <button type="button" aria-label={label} title="测试通道" disabled={testing} onClick={() => onTest(account)} className="icon-button">{testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CirclePlay className="size-4" aria-hidden="true" />}</button>;
}

function TestStatus({ test, pending }: Readonly<{ test: AccountTestState | null; pending: boolean }>) {
  if (pending) return <Tag tone="info"><Loader2 className="size-3 animate-spin" />测试中</Tag>;
  if (!test) return <Tag>未测试</Tag>;
  const presentation = TEST_STATUS_PRESENTATION[test.status];
  const title = `${test.message}\n耗时 ${test.latencyMs} ms${test.model ? `\n模型 ${test.model}` : ""}\n${formatTime(test.testedAt)}`;
  return <Tag tone={presentation.tone} title={title}>{presentation.label}<span className="font-mono tabular-nums">{test.latencyMs}ms</span></Tag>;
}

function StatusBadge({ status }: Readonly<{ status: string }>) { const active = status === "active"; return <Tag tone={active ? "success" : "neutral"}>{active ? "正常" : status}</Tag>; }
function GroupIds({ ids, groups }: Readonly<{ ids: readonly number[]; groups: ReadonlyMap<number, AccountGroupOption> }>) { return ids.length ? <span className="flex flex-wrap gap-1.5">{ids.map((id) => <GroupTag key={id} id={id} group={groups.get(id)} />)}</span> : <span className="text-muted">-</span>; }
function GroupTag({ id, group }: Readonly<{ id: number; group?: AccountGroupOption }>) { return <Tag tone={group ? "neutral" : "warning"} title={group?.name}><span className="max-w-32 truncate text-foreground">{group?.name ?? "未知分组"}</span><span className="tabular-nums">#{id}</span><span className="font-mono font-semibold tabular-nums text-rate">×{formatRate(group?.rate_multiplier)}</span></Tag>; }
function formatRate(value: number | null | undefined) { return value === null || value === undefined ? "-" : String(value); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN"); }
function Info({ label, children, wide = false }: Readonly<{ label: string; children: React.ReactNode; wide?: boolean }>) { return <div className={wide ? "sm:col-span-2" : ""}><dt className="mb-1 text-xs text-muted">{label}</dt><dd>{children}</dd></div>; }
function LoadingAccounts() { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取本地账号快照...</div>; }
const TEST_STATUS_PRESENTATION: Record<AccountTestState["status"], { readonly tone: TagTone; readonly label: string }> = { available: { tone: "success", label: "可用" }, unavailable: { tone: "danger", label: "不可用" }, error: { tone: "warning", label: "请求错误" } };
type AccountActionProps = { readonly account: TargetAccountView; readonly groups: ReadonlyMap<number, AccountGroupOption>; readonly rates: readonly AccountSourceRate[]; readonly sites: readonly AccountSourceSite[]; readonly testing: boolean; readonly bindingPending: boolean; readonly bindingDisabled: boolean; readonly onBind: (account: TargetAccountView, binding: AccountSourceBinding | null) => Promise<boolean>; readonly onTest: (account: TargetAccountView) => void };
type AccountListProps = Readonly<{ accounts: readonly TargetAccountView[]; groups: readonly AccountGroupOption[]; rates: readonly AccountSourceRate[]; sites: readonly AccountSourceSite[]; testPendingIds: readonly number[]; bindingPendingId: number | null; onBind: (account: TargetAccountView, binding: AccountSourceBinding | null) => Promise<boolean>; onTest: (account: TargetAccountView) => void }>;
