"use client";

import { AlertTriangle, CheckCircle2, Copy, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import type { CompensationClaim } from "../../server/compensation/types";
import { Button } from "../ui/button";

export function CompensationClaimList(props: Readonly<{
  items: readonly CompensationClaim[];
  loading: boolean;
}>) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div><h2 className="panel-title">计算与发码记录</h2><p className="panel-description">按最近计算时间排列</p></div>
        <ReceiptText className="size-5 text-primary" aria-hidden="true" />
      </div>
      {props.loading && !props.items.length ? <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取记录…</div> : null}
      {!props.loading && !props.items.length ? <div className="empty-state m-4"><ReceiptText className="size-7" /><span>暂无补偿计算记录</span></div> : null}
      {props.items.length ? <ul className="divide-y divide-border">{props.items.map((claim) => <ClaimRow key={claim.id} claim={claim} />)}</ul> : null}
    </section>
  );
}

function ClaimRow({ claim }: Readonly<{ claim: CompensationClaim }>) {
  const Icon = claim.status === "failed" ? AlertTriangle : CheckCircle2;
  const email = claim.sub2apiEmail || claim.maskedEmail;
  return (
    <li className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.2fr)] lg:items-center lg:px-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold"><Icon className={`size-4 shrink-0 ${claim.status === "failed" ? "text-danger" : "text-success"}`} />{statusLabel(claim.status)}</p>
        <p className="mt-1 text-xs text-muted">{formatDate(claim.createdAt)} · {claim.storeName}</p>
      </div>
      <div className="min-w-0 text-sm">
        <p className="truncate" title={email}>{email}</p>
        <p className="mt-1 text-xs text-muted">查询 {claim.results.length} 单 · 计入 {claim.summary.eligibleOrderCount} 单 · {formatMoney(claim.summary.totalCompensationFen)}</p>
      </div>
      <ClaimOutcome claim={claim} />
    </li>
  );
}

function ClaimOutcome({ claim }: Readonly<{ claim: CompensationClaim }>) {
  if (claim.status === "failed") return <p role="alert" className="break-words text-sm text-danger">{claim.errorMessage}</p>;
  if (!claim.redemptionCode) return <p className="text-sm text-muted">补偿金额为 0，未生成兑换码</p>;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
      <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">{claim.redemptionCode}</code>
      <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="复制兑换码" title="复制兑换码"
        onClick={() => void copyCode(claim.redemptionCode!)}><Copy className="size-4" /></Button>
    </div>
  );
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success("兑换码已复制");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
}

function statusLabel(status: CompensationClaim["status"]) {
  return { pending: "生成中", completed: "计算完成", failed: "发码失败" }[status];
}

function formatMoney(fen: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(fen / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
