"use client";

import { Link2, Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TargetGroupView } from "../groups/types";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Tag } from "../ui/tag";
import type { SourceRateHistoryTarget } from "./types";

export function SourceBindingDialog({ target, onOpenChange, onSaved }: Readonly<{
  target: SourceRateHistoryTarget | null;
  onOpenChange: (target: SourceRateHistoryTarget | null) => void;
  onSaved: (target: SourceRateHistoryTarget, mapped: boolean) => void;
}>) {
  const [groups, setGroups] = useState<TargetGroupView[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    let active = true;
    setLoading(true); setError(null); setGroups([]);
    void loadGroups().then((next) => {
      if (!active) return;
      setGroups(next);
      setSelected(new Set(next.filter((group) => hasSourceBinding(group, target)).map((group) => group.id)));
    }).catch((reason) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [target]);
  const save = async () => {
    if (!target) return;
    setSaving(true); setError(null);
    try {
      await saveBindings(target, selected);
      onSaved(target, selected.size > 0);
      onOpenChange(null);
      toast.success("目标分组关联已更新");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !saving) onOpenChange(null); }}>
      <DialogContent className="flex max-h-[86dvh] w-[min(96vw,720px)] flex-col overflow-hidden">
        <DialogHeader target={target} selected={selected.size} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40 p-4 sm:p-5">
          {loading ? <Loading /> : error ? <ErrorMessage message={error} /> : <GroupOptions groups={groups} target={target} selected={selected} onChange={setSelected} />}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface-muted/60 px-5 py-4">
          <DialogClose asChild><Button type="button" variant="secondary" disabled={saving}>取消</Button></DialogClose>
          <Button type="button" disabled={loading || saving || error !== null} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存关联</Button>
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" disabled={saving} className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function DialogHeader({ target, selected }: Readonly<{ target: SourceRateHistoryTarget | null; selected: number }>) {
  return <div className="shrink-0 border-b border-border bg-surface-muted/30 px-5 py-4 pr-16 sm:px-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><Link2 className="size-4 text-primary" />管理目标分组关联</DialogTitle><DialogDescription className="mt-1 text-sm leading-6 text-muted">{target ? `${target.siteName} · ${target.groupName}（${target.groupId}）` : ""}</DialogDescription><Tag tone="primary" className="mt-2">已关联 {selected} 个目标分组</Tag></div>;
}

function GroupOptions({ groups, target, selected, onChange }: Readonly<{
  groups: readonly TargetGroupView[];
  target: SourceRateHistoryTarget | null;
  selected: ReadonlySet<number>;
  onChange: (value: ReadonlySet<number>) => void;
}>) {
  if (!target) return null;
  if (groups.length === 0) return <p className="empty-state">本地暂无目标分组，请先在分组倍率页面刷新目标分组。</p>;
  return <div className="divide-y divide-border rounded-lg border border-border bg-surface">{groups.map((group) => {
    const checked = selected.has(group.id);
    const compatible = samePlatform(group.platform, target.groupType ?? target.platform);
    return <Label key={group.id} className={`flex min-h-14 items-center gap-3 px-4 py-3 ${compatible || checked ? "cursor-pointer hover:bg-surface-muted/60" : "cursor-not-allowed opacity-55"}`}><Checkbox checked={checked} disabled={!compatible && !checked} onCheckedChange={() => onChange(toggleSelection(selected, group.id))} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{group.name}</p><div className="mt-1 flex flex-wrap gap-1.5"><Tag>{group.platform ?? "未知平台"}</Tag><Tag tone={group.rule.enabled ? "success" : "neutral"}>{group.rule.enabled ? "规则启用" : "规则停用"}</Tag>{compatible ? null : <Tag tone="warning">平台不匹配</Tag>}</div></div><span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-effective-rate">×{formatRate(group.rate_multiplier)}</span></Label>;
  })}</div>;
}

function toggleSelection(current: ReadonlySet<number>, groupId: number) {
  const next = new Set(current);
  if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
  return next;
}

function hasSourceBinding(group: TargetGroupView, target: SourceRateHistoryTarget) {
  return group.bindings.some((binding) => binding.sourceSiteId === target.siteId && binding.sourceGroupId === target.groupId);
}

function samePlatform(left?: string | null, right?: string | null) { return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase()); }
function formatRate(value?: number | null) { return value === null || value === undefined ? "-" : Number(value.toFixed(4)); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function Loading() { return <div className="loading-state min-h-40"><Loader2 className="size-4 animate-spin" />正在读取目标分组...</div>; }
function ErrorMessage({ message }: Readonly<{ message: string }>) { return <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{message}</p>; }

async function loadGroups() {
  return (await request<{ groups: TargetGroupView[] }>("/api/groups")).groups;
}

async function saveBindings(target: SourceRateHistoryTarget, selected: ReadonlySet<number>) {
  await request("/api/sources/rates/bindings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceSiteId: target.siteId, sourceGroupId: target.groupId, targetGroupIds: [...selected] }) });
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `请求失败 HTTP ${response.status}`);
  return body;
}
