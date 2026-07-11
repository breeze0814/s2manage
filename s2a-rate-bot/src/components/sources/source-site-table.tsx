import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Tag } from "../ui/tag";
import type { SourceSiteView } from "./types";

export function SourceSiteTable({ sites, pendingId, onRefresh, onEdit, onDelete }: Readonly<{
  sites: readonly SourceSiteView[];
  pendingId: number | null;
  onRefresh: (site: SourceSiteView) => void;
  onEdit: (site: SourceSiteView) => void;
  onDelete: (site: SourceSiteView) => void;
}>) {
  if (sites.length === 0) return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-6 text-center text-sm text-muted">还没有采集站，请先添加一个采集源。</p>;
  return <div className="space-y-3">{sites.map((site) => <SourceCard key={site.id} site={site} pending={pendingId === site.id} onRefresh={onRefresh} onEdit={onEdit} onDelete={onDelete} />)}</div>;
}

function SourceCard(props: SourceActions & { site: SourceSiteView; pending: boolean }) {
  const { site } = props;
  return (
    <article className="space-y-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted/35">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium" title={site.name}>{site.name}</h3><TypeTag type={site.siteType} /><Status site={site} /></div><p className="mt-1 truncate text-xs text-muted" title={site.baseUrl}>{site.baseUrl}</p></div><div className="shrink-0 text-right"><p className="text-xs text-muted">余额</p><p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums text-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />{formatBalance(site.balance)}</p></div></div>
      <SiteMeta {...props} />
    </article>
  );
}

function SiteMeta(props: SourceActions & { site: SourceSiteView; pending: boolean }) {
  const { site } = props;
  return <div className="flex min-w-0 items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap gap-1.5"><Tag className="font-mono tabular-nums">充值 ×{site.rechargeRatio}</Tag>{site.useProxy ? <Tag tone="info">使用代理</Tag> : null}</div><ActionButtons {...props} /></div>;
}

function TypeTag({ type }: Readonly<{ type: SourceSiteView["siteType"] }>) {
  return <Tag tone="primary">{type === "newapi" ? "New API" : "Sub2API"}</Tag>;
}

function ActionButtons({ site, pending, onRefresh, onEdit, onDelete }: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <div className="flex shrink-0 justify-end gap-1">
      <IconButton label="刷新" marker="data-refresh-site" disabled={pending || !site.enabled} onClick={() => onRefresh(site)}><RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} /></IconButton>
      <IconButton label="编辑" marker="data-edit-site" onClick={() => onEdit(site)}><Pencil className="size-3.5" /></IconButton>
      <IconButton label="删除" marker="data-delete-site" onClick={() => onDelete(site)}><Trash2 className="size-3.5" /></IconButton>
    </div>
  );
}

function IconButton({ label, marker, children, ...button }: Readonly<{ label: string; marker: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...{ [marker]: true }} {...button} className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40">{children}</button>;
}

function Status({ site }: Readonly<{ site: SourceSiteView }>) {
  const text = !site.enabled ? "已停用" : site.lastStatus === "failed" ? "失败" : site.lastStatus === "success" ? "正常" : "未运行";
  const tone = site.lastStatus === "failed" ? "danger" : site.enabled ? "success" : "neutral";
  return <Tag title={site.lastError ?? undefined} tone={tone}>{text}</Tag>;
}

function formatBalance(value: number | null) { return value === null ? "-" : String(value); }
type SourceActions = { onRefresh: (site: SourceSiteView) => void; onEdit: (site: SourceSiteView) => void; onDelete: (site: SourceSiteView) => void };
