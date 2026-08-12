"use client";

import { AlertTriangle, Calculator, CircleDollarSign, Loader2, RefreshCw, TicketCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminCompensationSettings, CompensationClaim } from "../../server/compensation/types";
import { Button } from "../ui/button";
import { DataLoadError } from "../ui/data-load-error";
import { requestJson } from "./api";
import { CompensationClaimList } from "./compensation-claim-list";
import { CompensationConfigForm } from "./compensation-config-form";
import { EngagementPageHeader } from "./engagement-page-header";

export function CompensationDashboard() {
  const [settings, setSettings] = useState<AdminCompensationSettings | null>(null);
  const [claims, setClaims] = useState<CompensationClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => void loadDashboard({ setSettings, setClaims, setLoading, setError });
  useEffect(() => { void loadDashboard({ setSettings, setClaims, setLoading, setError }); }, []);
  const hasData = settings !== null || claims.length > 0;
  return (
    <section className="page-stack">
      <EngagementPageHeader kind="compensation" title="订单补偿" description="配置联动小铺订单补偿规则，并查看自动生成的余额兑换码。" actions={
        <Button type="button" variant="secondary" size="icon" aria-label="刷新补偿数据" title="刷新" disabled={loading} onClick={load}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      } />
      {loading && !hasData ? <div className="loading-state"><Loader2 className="size-4 animate-spin" />读取补偿活动配置…</div>
        : error && !hasData ? <DataLoadError message={`订单补偿数据加载失败：${error}`} onRetry={load} pending={loading} className="min-h-36 justify-center" />
          : <>{error ? <DataLoadError message={`订单补偿数据刷新失败：${error}`} onRetry={load} pending={loading} /> : null}<CompensationStats settings={settings} claims={claims} />
            {settings ? <CompensationConfigForm settings={settings} onSaved={setSettings} /> : null}
            <CompensationClaimList items={claims} loading={loading} /></>}
    </section>
  );
}

function CompensationStats(props: Readonly<{
  settings: AdminCompensationSettings | null;
  claims: readonly CompensationClaim[];
}>) {
  const completed = props.claims.filter((claim) => claim.status === "completed");
  const failed = props.claims.filter((claim) => claim.status === "failed").length;
  const amount = completed.reduce((sum, claim) => sum + claim.summary.totalCompensationFen, 0);
  const values = [
    { label: "活动状态", value: props.settings?.enabled ? "已开放" : "已关闭", icon: Calculator },
    { label: "完成计算", value: String(completed.length), icon: TicketCheck },
    { label: "累计补偿", value: formatMoney(amount), icon: CircleDollarSign },
    { label: "发码失败", value: String(failed), icon: AlertTriangle },
  ];
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{values.map(({ label, value, icon: Icon }) => (
    <div key={label} className="metric-card"><div className="flex items-center justify-between gap-3"><dt className="text-sm text-muted">{label}</dt><Icon className="size-4 text-primary-strong" /></div><dd className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</dd></div>
  ))}</dl>;
}

async function loadDashboard(input: Readonly<{
  setSettings: (value: AdminCompensationSettings) => void;
  setClaims: (value: CompensationClaim[]) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string) => void;
}>) {
  input.setLoading(true);
  input.setError("");
  try {
    const [settings, claims] = await Promise.all([
      requestJson<AdminCompensationSettings>("/api/compensation/config"),
      requestJson<{ items: CompensationClaim[] }>("/api/compensation/claims"),
    ]);
    input.setSettings(settings);
    input.setClaims(claims.items);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.setError(message);
    toast.error(message);
  } finally {
    input.setLoading(false);
  }
}

function formatMoney(fen: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(fen / 100);
}
