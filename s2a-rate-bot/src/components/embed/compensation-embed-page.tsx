"use client";

import { Calculator, CheckCircle2, Copy, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CompensationRule } from "../../core/compensation";
import type { CompensationClaim, PublicCompensationSettings } from "../../server/compensation/types";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { EmbedError, EmbedHeader, EmbedLoading } from "./embed-state";
import { embedRequestJson, useEmbedSession } from "./use-embed-session";

export function CompensationEmbedPage() {
  const { session, error, loading } = useEmbedSession("compensation");
  if (loading) return <EmbedLoading />;
  if (error || !session) return <EmbedError message={error || "嵌入会话不可用"} />;
  if (!session.settings) return <EmbedError message="补偿活动配置缺失" />;
  return <CompensationWorkspace token={session.token} settings={session.settings as PublicCompensationSettings} />;
}

function CompensationWorkspace(props: Readonly<{
  token: string;
  settings: PublicCompensationSettings;
}>) {
  return (
    <div className="min-h-dvh bg-background">
      <EmbedHeader eyebrow="Compensation" title={props.settings.activityName} description={props.settings.description} />
      {props.settings.enabled ? <ActiveCompensation token={props.token} settings={props.settings} /> : (
        <main className="mx-auto max-w-6xl p-4 sm:p-6"><div className="empty-state"><Calculator className="size-7" /><span>订单补偿活动当前未开放</span></div></main>
      )}
    </div>
  );
}

function ActiveCompensation(props: Readonly<{
  token: string;
  settings: PublicCompensationSettings;
}>) {
  const [orders, setOrders] = useState("");
  const [claim, setClaim] = useState<CompensationClaim | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const count = orderCount(orders);
  const submit = () => void calculate({ token: props.token, orders, setClaim, setPending, setFieldError });
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <RuleStrip rules={props.settings.rules} />
      <section className="panel overflow-hidden">
        <div className="panel-header"><div><h2 className="panel-title">订单查询</h2><p className="panel-description">共 {count} 条订单</p></div><Calculator className="size-5 text-primary" /></div>
        <form className="p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <Label htmlFor="compensation-orders" className="block font-medium">订单号（每行一个）</Label>
          <Textarea id="compensation-orders" rows={6} required spellCheck={false} autoComplete="off" className="mt-2 min-h-36 resize-y font-mono"
            aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "compensation-orders-error" : undefined}
            placeholder={"LD260731YBGYX1\nLD260731WAHCDK"} value={orders}
            onChange={(event) => { setOrders(event.target.value); setFieldError(""); }} />
          {fieldError ? <p id="compensation-orders-error" role="alert" className="mt-2 text-sm text-danger">{fieldError}</p> : null}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={pending || !orders} onClick={() => { setOrders(""); setClaim(null); setFieldError(""); }}><RotateCcw className="size-4" />清空</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}{pending ? "计算并生成中" : "计算补偿"}</Button>
          </div>
        </form>
      </section>
      {claim ? <CompensationResult claim={claim} /> : null}
    </main>
  );
}

function RuleStrip({ rules }: Readonly<{ rules: readonly CompensationRule[] }>) {
  return <section aria-labelledby="compensation-rules-title"><h2 id="compensation-rules-title" className="text-sm font-semibold">补偿区间</h2>
    <div className="mt-2 grid gap-2 md:grid-cols-3">{rules.map((rule) => (
      <article key={rule.id} className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3"><strong className="text-sm">{rule.name}</strong><span className="font-semibold tabular-nums text-primary-strong">{rule.ratePercent}%</span></div>
        <p className="mt-1 text-xs leading-5 text-muted">{formatRuleDate(rule.startAt)} 至 {formatRuleDate(rule.endAt)}</p>
      </article>
    ))}</div>
  </section>;
}

function CompensationResult({ claim }: Readonly<{ claim: CompensationClaim }>) {
  return (
    <section className="panel overflow-hidden" tabIndex={-1} aria-labelledby="compensation-result-title">
      <div className="border-b border-border bg-primary/5 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div><p className="text-sm text-muted">补偿合计</p><h2 id="compensation-result-title" className="mt-1 text-3xl font-semibold tabular-nums text-primary-strong">{formatMoney(claim.summary.totalCompensationFen)}</h2><p className="mt-1 text-xs text-muted">计入 {claim.summary.eligibleOrderCount} 单 · 无效 {claim.summary.invalidOrderCount} 单</p></div>
        <RedemptionCode claim={claim} />
      </div>
      <ol className="divide-y divide-border">{claim.results.map((result) => <ResultRow key={`${result.lineNumber}-${result.requestedTradeNo}`} result={result} />)}</ol>
    </section>
  );
}

function RedemptionCode({ claim }: Readonly<{ claim: CompensationClaim }>) {
  if (!claim.redemptionCode) return <p className="mt-4 text-sm text-muted sm:mt-0">无可补偿金额，未生成兑换码</p>;
  return (
    <div className="mt-4 min-w-0 rounded-lg border border-primary/25 bg-surface p-3 sm:mt-0 sm:w-[min(100%,360px)]">
      <p className="text-xs font-semibold text-muted">{claim.alreadyRedeemed ? "订单已使用 · 原兑换码" : "余额兑换码"}</p>
      <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all font-mono text-sm font-semibold">{claim.redemptionCode}</code>
        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="复制兑换码" title="复制兑换码" onClick={() => void copyCode(claim.redemptionCode!)}><Copy className="size-4" /></Button>
      </div>
    </div>
  );
}

function ResultRow({ result }: Readonly<{ result: CompensationClaim["results"][number] }>) {
  const found = result.status === "found" && result.order && result.compensation;
  const Icon = found ? CheckCircle2 : XCircle;
  return (
    <li className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(160px,1fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)] sm:items-center sm:px-5">
      <div className="min-w-0"><p className="flex items-center gap-2 font-semibold"><Icon className={`size-4 shrink-0 ${found ? "text-success" : "text-danger"}`} /><span className="break-all font-mono">{result.requestedTradeNo}</span></p>{result.order ? <p className="mt-1 truncate text-xs text-muted">{result.order.goodsName}</p> : null}</div>
      {found ? <><div><p className="text-xs text-muted">{formatDate(result.order!.createTime)}</p><p className="mt-1 tabular-nums">实付 {formatYuan(result.order!.totalAmount)}</p></div><div className="sm:text-right"><p className="text-xs text-muted">{result.compensation!.ruleName} · {result.compensation!.ratePercent}%</p><p className="mt-1 font-semibold tabular-nums text-primary-strong">{formatMoney(result.compensation!.compensationFen)}</p></div></> : <p className="text-muted sm:col-span-2">{result.message}</p>}
    </li>
  );
}

async function calculate(input: Readonly<{
  token: string;
  orders: string;
  setClaim: (claim: CompensationClaim) => void;
  setPending: (pending: boolean) => void;
  setFieldError: (message: string) => void;
}>) {
  if (!input.orders.split(/\r?\n/).some((line) => line.trim())) {
    input.setFieldError("请至少输入一个订单号，每行一个");
    return;
  }
  input.setPending(true);
  try {
    const claim = await embedRequestJson<CompensationClaim>("/api/embed/compensation", input.token, { method: "POST", body: JSON.stringify({ orders: input.orders }) });
    input.setClaim(claim);
    toast.success(claim.alreadyRedeemed ? "订单已使用，已返回原兑换码" : "补偿计算与兑换码生成完成");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    input.setPending(false);
  }
}

function orderCount(value: string) { return value.split(/\r?\n/).filter((line) => line.trim()).length; }
function formatMoney(fen: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(fen / 100); }
function formatYuan(yuan: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(yuan); }
function formatDate(seconds: number) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(new Date(seconds * 1_000)); }
function formatRuleDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
async function copyCode(code: string) { try { await navigator.clipboard.writeText(code); toast.success("兑换码已复制"); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } }
