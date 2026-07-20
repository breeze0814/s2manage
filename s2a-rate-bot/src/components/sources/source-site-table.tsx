"use client";

import { ExternalLink, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmAlert } from "../ui/confirm-alert";
import { Tag } from "../ui/tag";
import type { SourceSiteView } from "./types";

export function SourceSiteTable({ sites, selectedSiteId, pendingId, onSelect, onRefresh, onEdit, onDelete }: Readonly<{
  sites: readonly SourceSiteView[];
  selectedSiteId: number | null;
  pendingId: number | null;
  onSelect: (siteId: number) => void;
  onRefresh: (site: SourceSiteView) => void;
  onEdit: (site: SourceSiteView) => void;
  onDelete: (site: SourceSiteView) => void;
}>) {
  const [deleteTarget, setDeleteTarget] = useState<SourceSiteView | null>(null);
  if (sites.length === 0) return <p className="rounded-xl border border-dashed border-border-strong bg-surface-muted p-6 text-center text-sm text-muted">还没有采集站，请先添加一个采集源。</p>;
  return <><div role="listbox" aria-label="选择采集站" className="space-y-3">{sites.map((site) => <SourceCard key={site.id} site={site} selected={selectedSiteId === site.id} pending={pendingId === site.id} onSelect={onSelect} onRefresh={onRefresh} onEdit={onEdit} onDelete={setDeleteTarget} />)}</div><ConfirmAlert open={deleteTarget !== null} title="删除采集站" description={`确定删除采集站「${deleteTarget?.name ?? ""}」？此操作无法撤销。`} confirmLabel="确认删除" onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) onDelete(deleteTarget); setDeleteTarget(null); }} /></>;
}

function SourceCard(props: SourceActions & { site: SourceSiteView; selected: boolean; pending: boolean; onSelect: (siteId: number) => void }) {
  const { site } = props;
  return (
    <article role="option" aria-selected={props.selected} tabIndex={0} onClick={() => props.onSelect(site.id)} onKeyDown={(event) => selectWithKeyboard(event, site.id, props.onSelect)} className={`cursor-pointer space-y-3 rounded-xl border p-4 outline-none transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary/30 ${props.selected ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/25" : "border-border bg-surface hover:bg-surface-muted/35"}`}>
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium" title={site.name}>{site.name}</h3><TypeTag type={site.siteType} /><Status site={site} /></div><p className="mt-1 truncate text-xs text-muted" title={site.baseUrl}>{site.baseUrl}</p></div><div className="shrink-0 text-right"><p className="text-xs text-muted">余额</p><p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums text-balance-value"><span aria-hidden="true" className="size-1.5 rounded-full bg-balance-value" />{formatBalance(site.balance)}</p></div></div>
      <SiteMeta {...props} />
    </article>
  );
}

function SiteMeta(props: SourceActions & { site: SourceSiteView; pending: boolean }) {
  const { site } = props;
  return <div className="flex min-w-0 items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap gap-1.5"><Tag tone="rate" className="font-mono tabular-nums">充值 ×{site.rechargeRatio}</Tag>{site.useProxy ? <Tag tone="info">使用代理</Tag> : null}</div><ActionButtons {...props} /></div>;
}

function TypeTag({ type }: Readonly<{ type: SourceSiteView["siteType"] }>) {
  return <Tag tone="primary">{type === "newapi" ? "New API" : "Sub2API"}</Tag>;
}

function ActionButtons({ site, pending, onRefresh, onEdit, onDelete }: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <div className="flex shrink-0 justify-end gap-1" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <WebsiteAction site={site} />
      <IconButton label="刷新" marker="data-refresh-site" disabled={pending || !site.enabled} onClick={() => onRefresh(site)}><RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} /></IconButton>
      <IconButton label="编辑" marker="data-edit-site" onClick={() => onEdit(site)}><Pencil className="size-3.5" /></IconButton>
      <IconButton label="删除" marker="data-delete-site" onClick={() => onDelete(site)}><Trash2 className="size-3.5" /></IconButton>
    </div>
  );
}

function WebsiteAction({ site }: Readonly<{ site: SourceSiteView }>) {
  if (!site.websiteUrl) return <IconButton label="未配置官网" marker="data-open-site-website" disabled><ExternalLink className="size-3.5" /></IconButton>;
  return <a href={site.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开「${site.name}」官网`} title="打开官网" data-open-site-website className={SITE_ACTION_CLASS}><ExternalLink className="size-3.5" /></a>;
}

function IconButton({ label, marker, children, ...button }: Readonly<{ label: string; marker: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" aria-label={label} title={label} {...{ [marker]: true }} {...button} className={SITE_ACTION_CLASS}>{children}</button>;
}

function Status({ site }: Readonly<{ site: SourceSiteView }>) {
  const text = !site.enabled ? "已停用" : site.lastStatus === "failed" ? "失败" : site.lastStatus === "success" ? "正常" : "未运行";
  const tone = site.lastStatus === "failed" ? "danger" : site.enabled ? "success" : "neutral";
  return <Tag title={site.lastError ?? undefined} tone={tone}>{text}</Tag>;
}

function formatBalance(value: number | null) { return value === null ? "-" : String(value); }
function selectWithKeyboard(event: React.KeyboardEvent, siteId: number, onSelect: (siteId: number) => void) { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelect(siteId); }
const SITE_ACTION_CLASS = "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-40";
type SourceActions = { onRefresh: (site: SourceSiteView) => void; onEdit: (site: SourceSiteView) => void; onDelete: (site: SourceSiteView) => void };
