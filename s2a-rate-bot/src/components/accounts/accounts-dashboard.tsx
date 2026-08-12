"use client";

import { CirclePlay, ListChecks, Loader2, Power, RefreshCw } from "lucide-react";
import { useState } from "react";
import { PlatformLabel } from "../platform-icon";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { OverflowAction, OverflowActions } from "../ui/overflow-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tag, type TagTone } from "../ui/tag";
import { DataLoadError } from "../ui/data-load-error";
import { AccountInfo, LoadingAccounts, type AccountActionProps, type AccountListProps } from "./account-dashboard-support";
import { AccountBindingDialog, AccountBindingSummary } from "./account-binding-dialog";
import type { AccountGroupOption, AccountTestState, TargetAccountView } from "./types";
import { useAccountsDashboard } from "./use-accounts-dashboard";

export function AccountsDashboard() {
  const view = useAccountsDashboard();
  const [scheduleTarget, setScheduleTarget] = useState<TargetAccountView | null>(null);
  const testing = view.testPendingIds.length > 0;
  const requestScheduleChange = (account: TargetAccountView) => {
    if (account.schedulable) setScheduleTarget(account);
    else void view.setSchedulable(account, true);
  };
  const confirmDisable = () => {
    if (scheduleTarget) void view.setSchedulable(scheduleTarget, false);
    setScheduleTarget(null);
  };
  return <>
    <section className="page-stack">
      <header className="page-header">
        <div className="min-w-0">
          <h1 className="page-heading">账号调度</h1>
          <p className="page-description">查看账号状态、倍率绑定与调度可用性</p>
        </div>
        <div className="page-actions">
          <div className="page-actions-primary"><Button type="button" variant="secondary" onClick={view.refresh} disabled={view.loading || testing} className="shrink-0">
            {view.loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            刷新账号
          </Button></div>
          <div className="page-actions-secondary"><Button type="button" variant="secondary" onClick={view.testAll} disabled={view.loading || testing || view.accounts.length === 0} className="shrink-0">
            {view.batchTesting ? <Loader2 className="size-3.5 animate-spin" /> : <ListChecks className="size-3.5" />}
            批量测试
          </Button>
          </div>
          <OverflowActions className="page-actions-overflow"><OverflowAction disabled={view.loading || testing || view.accounts.length === 0} onClick={view.testAll}>{view.batchTesting ? <Loader2 className="animate-spin" /> : <ListChecks />}批量测试</OverflowAction></OverflowActions>
        </div>
      </header>
      {view.loading && view.accounts.length === 0 ? (
        <LoadingAccounts />
      ) : view.loadError && view.accounts.length === 0 ? (
        <DataLoadError message={`账号数据加载失败：${view.loadError}`} onRetry={view.refresh} pending={view.loading} className="min-h-36 justify-center" />
      ) : (
        <>
          {view.loadError ? <DataLoadError message={`账号数据刷新失败：${view.loadError}`} onRetry={view.refresh} pending={view.loading} /> : null}
          <AccountList
            accounts={view.accounts}
            groups={view.groups}
            rates={view.rates}
            sites={view.sites}
            testPendingIds={view.testPendingIds}
            bindingPendingId={view.bindingPendingId}
            schedulePendingId={view.schedulePendingId}
            onBind={view.bindSource}
            onTest={view.testChannel}
            onSchedule={requestScheduleChange}
          />
        </>
      )}
    </section>
    <ConfirmAlert
      open={scheduleTarget !== null}
      title="禁用账号调度"
      description={`确定禁用账号「${scheduleTarget?.name ?? ""}」的调度？账号仍会保留，可随时重新启用。`}
      confirmLabel="禁用调度"
      onOpenChange={(open) => { if (!open) setScheduleTarget(null); }}
      onConfirm={confirmDisable}
    />
  </>;
}

function AccountList(input: AccountListProps) {
  if (input.accounts.length === 0) return <p className="empty-state">目标站没有返回账号，或尚未完成全局配置。</p>;
  const groupMap = new Map(input.groups.map((group) => [group.id, group]));
  const actionProps = (account: TargetAccountView): AccountActionProps => ({
    account,
    groups: groupMap,
    rates: input.rates,
    sites: input.sites,
    testing: input.testPendingIds.includes(account.id),
    bindingPending: input.bindingPendingId === account.id,
    bindingDisabled: input.bindingPendingId !== null,
    scheduling: input.schedulePendingId === account.id,
    onBind: input.onBind,
    onTest: input.onTest,
    onSchedule: input.onSchedule,
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {input.accounts.map((account) => <AccountCard key={account.id} {...actionProps(account)} />)}
      </div>
      <div className="table-shell desktop-table-viewport hidden lg:block">
        <Table className="data-table-sticky min-w-[920px]">
          <AccountHead />
          <TableBody>
            {input.accounts.map((account) => <AccountRow key={account.id} {...actionProps(account)} />)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AccountHead() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="text-right">ID</TableHead>
        <TableHead>账号</TableHead>
        <TableHead className="hidden xl:table-cell">平台</TableHead>
        <TableHead>状态</TableHead>
        <TableHead>调度</TableHead>
        <TableHead className="text-right">优先级 / 倍率</TableHead>
        <TableHead>倍率绑定</TableHead>
        <TableHead className="hidden xl:table-cell">目标分组</TableHead>
        <TableHead className="hidden xl:table-cell">测试</TableHead>
        <TableHead className="sticky-action-header">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function AccountRow(props: AccountActionProps) {
  const { account } = props;
  return (
    <TableRow>
      <TableCell className="text-right font-mono text-sm tabular-nums text-muted">#{account.id}</TableCell>
      <TableCell>
        <div className="min-w-0">
          <p className="font-medium">{account.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 xl:hidden">
            <Tag><PlatformLabel platform={account.platform} /></Tag>
            <TestStatus test={account.lastTest} pending={props.testing} compact />
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden xl:table-cell"><Tag><PlatformLabel platform={account.platform} /></Tag></TableCell>
      <TableCell><StatusBadge status={account.status} /></TableCell>
      <TableCell><ScheduleBadge schedulable={account.schedulable} /></TableCell>
      <TableCell className="text-right"><AccountMetrics account={account} /></TableCell>
      <TableCell><AccountBindingCell {...props} /></TableCell>
      <TableCell className="hidden xl:table-cell"><GroupIds ids={account.groupIds} groups={props.groups} /></TableCell>
      <TableCell className="hidden xl:table-cell"><TestStatus test={account.lastTest} pending={props.testing} /></TableCell>
      <TableCell className="sticky-action-cell"><AccountActions {...props} /></TableCell>
    </TableRow>
  );
}

function AccountCard(props: AccountActionProps) {
  const { account } = props;
  return (
    <article className="panel space-y-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium" title={account.name}>{account.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag><PlatformLabel platform={account.platform} /></Tag>
            <Tag>#{account.id}</Tag>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={account.status} />
          <ScheduleBadge schedulable={account.schedulable} />
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <AccountInfo label="目标分组"><GroupIds ids={account.groupIds} groups={props.groups} /></AccountInfo>
        <AccountInfo label="优先级 / 倍率"><AccountMetrics account={account} /></AccountInfo>
        <AccountInfo label="倍率采集绑定" wide><AccountBindingCell {...props} /></AccountInfo>
        <AccountInfo label="测试状态"><TestStatus test={account.lastTest} pending={props.testing} /></AccountInfo>
      </dl>
      <div className="flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-sm text-muted">操作</span>
        <AccountActions {...props} />
      </div>
    </article>
  );
}

function AccountBindingCell(props: AccountActionProps) {
  return (
    <div className="min-w-36 max-w-52 2xl:max-w-72">
      <AccountBindingSummary account={props.account} rates={props.rates} sites={props.sites} />
    </div>
  );
}

function AccountActions(props: AccountActionProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <AccountBindingDialog
        account={props.account}
        rates={props.rates}
        sites={props.sites}
        pending={props.bindingPending}
        disabled={props.bindingDisabled}
        onSave={(binding) => props.onBind(props.account, binding)}
      />
      <TestChannelButton {...props} />
      <ScheduleButton {...props} />
    </div>
  );
}

function AccountMetrics({ account }: Readonly<{ account: TargetAccountView }>) {
  return (
    <span className="font-mono font-semibold tabular-nums">
      <span>{account.priority ?? "-"}</span>
      <span className="px-1 text-muted">/</span>
      <span className="text-rate">{account.rateMultiplier ?? "-"}</span>
    </span>
  );
}

function TestChannelButton({ account, testing, onTest }: AccountActionProps) {
  const label = `测试 ${account.name} 的通道可用性`;
  return (
    <Button type="button" variant="secondary" size="icon" aria-label={label} title="测试通道" disabled={testing} onClick={() => onTest(account)}>
      {testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CirclePlay className="size-4" aria-hidden="true" />}
    </Button>
  );
}

function ScheduleButton({ account, testing, scheduling, onSchedule }: AccountActionProps) {
  const label = account.schedulable ? `禁用 ${account.name} 的调度` : `启用 ${account.name} 的调度`;
  return (
    <Button
      type="button"
      aria-label={label}
      title={account.schedulable ? "禁用调度" : "启用调度"}
      aria-pressed={account.schedulable}
      disabled={testing || scheduling}
      onClick={() => onSchedule(account)}
      variant="secondary"
      size="icon"
      className={account.schedulable ? "text-success" : "text-muted"}
    >
      {scheduling ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Power className="size-4" aria-hidden="true" />}
    </Button>
  );
}

function TestStatus({ test, pending, compact = false }: Readonly<{ test: AccountTestState | null; pending: boolean; compact?: boolean }>) {
  if (pending) return <Tag tone="info"><Loader2 className="size-3 animate-spin" />测试中</Tag>;
  if (!test) return compact ? null : <Tag>未测试</Tag>;
  const presentation = TEST_STATUS_PRESENTATION[test.status];
  const title = `${test.message}\n耗时 ${test.latencyMs} ms${test.model ? `\n模型 ${test.model}` : ""}\n${formatTime(test.testedAt)}`;
  return (
    <Tag tone={presentation.tone} title={title}>
      {presentation.label}
      {!compact ? <span className="font-mono tabular-nums">{test.latencyMs}ms</span> : null}
    </Tag>
  );
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const active = status === "active";
  return <Tag tone={active ? "success" : "neutral"}>{active ? "正常" : status}</Tag>;
}

function ScheduleBadge({ schedulable }: Readonly<{ schedulable: boolean }>) {
  return <Tag tone={schedulable ? "success" : "warning"}>{schedulable ? "参与调度" : "已暂停"}</Tag>;
}

function GroupIds({ ids, groups }: Readonly<{ ids: readonly number[]; groups: ReadonlyMap<number, AccountGroupOption> }>) {
  return ids.length
    ? <span className="flex flex-wrap gap-1.5">{ids.map((id) => <GroupTag key={id} id={id} group={groups.get(id)} />)}</span>
    : <span className="text-muted">-</span>;
}

function GroupTag({ id, group }: Readonly<{ id: number; group?: AccountGroupOption }>) {
  return (
    <Tag tone={group ? "neutral" : "warning"} title={group?.name}>
      <span className="max-w-32 truncate text-foreground">{group?.name ?? "未知分组"}</span>
      <span className="tabular-nums">#{id}</span>
      <span className="font-mono font-semibold tabular-nums text-rate">×{formatRate(group?.rate_multiplier)}</span>
    </Tag>
  );
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : String(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

const TEST_STATUS_PRESENTATION: Record<AccountTestState["status"], { readonly tone: TagTone; readonly label: string }> = {
  available: { tone: "success", label: "可用" },
  unavailable: { tone: "danger", label: "不可用" },
  error: { tone: "warning", label: "请求错误" },
};
