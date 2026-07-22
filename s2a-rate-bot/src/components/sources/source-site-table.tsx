"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
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
  if (sites.length === 0) return <p className="rounded-lg border border-dashed border-border-strong bg-surface-muted p-6 text-center text-sm text-muted">还没有采集站，请先添加一个采集源。</p>;
  return <><div role="listbox" aria-label="选择采集站" className="grid gap-3">{sites.map((site) => <SourceCard key={site.id} site={site} selected={selectedSiteId === site.id} pending={pendingId === site.id} onSelect={onSelect} onRefresh={onRefresh} onEdit={onEdit} onDelete={setDeleteTarget} />)}</div><ConfirmAlert open={deleteTarget !== null} title="删除采集站" description={`确定删除采集站「${deleteTarget?.name ?? ""}」？此操作无法撤销。`} confirmLabel="确认删除" onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) onDelete(deleteTarget); setDeleteTarget(null); }} /></>;
}

function SourceCard(props: SourceActions & { site: SourceSiteView; selected: boolean; pending: boolean; onSelect: (siteId: number) => void }) {
  const { site } = props;
  return (
    <ContextMenu.Root onOpenChange={(open) => { if (open) props.onSelect(site.id); }}>
      <ContextMenu.Trigger asChild>
        <article role="option" aria-selected={props.selected} tabIndex={0} onClick={() => props.onSelect(site.id)} onKeyDown={(event) => selectWithKeyboard(event, site.id, props.onSelect)} className={`cursor-context-menu space-y-3 rounded-lg border bg-surface px-4 py-3.5 shadow-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:border-primary data-[state=open]:bg-primary/5 data-[state=open]:ring-1 data-[state=open]:ring-primary/20 ${props.selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border-strong hover:border-primary/40 hover:bg-surface-muted/55"}`}>
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium" title={site.name}>{site.name}</h3><TypeTag type={site.siteType} /><Status site={site} /></div><p className="mt-1 truncate text-xs text-muted" title={site.baseUrl}>{site.baseUrl}</p></div><div className="shrink-0 text-right"><p className="text-xs text-muted">余额</p><p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums text-balance-value"><span aria-hidden="true" className="size-1.5 rounded-full bg-balance-value" />{formatBalance(site.balance)}</p></div></div>
          <SiteMeta site={site} />
        </article>
      </ContextMenu.Trigger>
      <SourceCardMenu {...props} />
    </ContextMenu.Root>
  );
}

function SiteMeta({ site }: Readonly<{ site: SourceSiteView }>) {
  return <div className="flex min-w-0 flex-wrap gap-1.5 border-t border-border pt-3"><Tag tone="rate" className="font-mono tabular-nums">充值 ×{site.rechargeRatio}</Tag>{site.useProxy ? <Tag tone="info">使用代理</Tag> : null}</div>;
}

function TypeTag({ type }: Readonly<{ type: SourceSiteView["siteType"] }>) {
  return <Tag tone="primary">{type === "newapi" ? "New API" : "Sub2API"}</Tag>;
}

function SourceCardMenu({ site, pending, onRefresh, onEdit, onDelete }: SourceActions & { site: SourceSiteView; pending: boolean }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content aria-label={`${site.name} 操作`} className="z-[70] min-w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl">
        <WebsiteMenuItem site={site} />
        <MenuItem marker="data-refresh-site" disabled={pending || !site.enabled} onSelect={() => onRefresh(site)} icon={<RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />} label="刷新采集站" />
        <MenuItem marker="data-edit-site" onSelect={() => onEdit(site)} icon={<Pencil className="size-4" />} label="编辑采集站" />
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <MenuItem marker="data-delete-site" danger onSelect={() => onDelete(site)} icon={<Trash2 className="size-4" />} label="删除采集站" />
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function WebsiteMenuItem({ site }: Readonly<{ site: SourceSiteView }>) {
  if (!site.websiteUrl) return <MenuItem marker="data-open-site-website" disabled icon={<ExternalLink className="size-4" />} label="未配置官网" />;
  return <ContextMenu.Item asChild><a href={site.websiteUrl} target="_blank" rel="noopener noreferrer" data-open-site-website className={MENU_ITEM_CLASS}><ExternalLink className="size-4" />打开官网</a></ContextMenu.Item>;
}

function MenuItem({ marker, icon, label, danger = false, ...item }: Readonly<{ marker: string; icon: React.ReactNode; label: string; danger?: boolean } & ContextMenu.ContextMenuItemProps>) {
  return <ContextMenu.Item {...{ [marker]: true }} {...item} className={`${MENU_ITEM_CLASS} ${danger ? "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger" : "data-[highlighted]:bg-surface-muted"}`}>{icon}{label}</ContextMenu.Item>;
}

function Status({ site }: Readonly<{ site: SourceSiteView }>) {
  const text = !site.enabled ? "已停用" : site.lastStatus === "failed" ? "失败" : site.lastStatus === "success" ? "正常" : "未运行";
  const tone = site.lastStatus === "failed" ? "danger" : site.enabled ? "success" : "neutral";
  return <Tag title={site.lastError ?? undefined} tone={tone}>{text}</Tag>;
}

function formatBalance(value: number | null) { return value === null ? "-" : String(value); }
function selectWithKeyboard(event: React.KeyboardEvent, siteId: number, onSelect: (siteId: number) => void) { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); onSelect(siteId); }
const MENU_ITEM_CLASS = "flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40";
type SourceActions = { onRefresh: (site: SourceSiteView) => void; onEdit: (site: SourceSiteView) => void; onDelete: (site: SourceSiteView) => void };
