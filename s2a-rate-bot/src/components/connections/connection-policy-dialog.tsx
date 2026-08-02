"use client";

import { Save, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Tag } from "../ui/tag";
import type { ConnectionView, HealthMonitor, HealthPolicy } from "./types";

export function ConnectionPolicyDialog({ connection, monitor, policies, pending, onOpenChange, onSave }: Readonly<{
  connection: ConnectionView | null;
  monitor: HealthMonitor | null;
  policies: readonly HealthPolicy[];
  pending: boolean;
  onOpenChange: (connection: ConnectionView | null) => void;
  onSave: (connectionId: string, policyId: number | null) => Promise<boolean>;
}>) {
  const [policyId, setPolicyId] = useState("none");
  useEffect(() => { if (connection) setPolicyId(monitor?.policy ? String(monitor.policy.id) : "none"); }, [connection, monitor]);
  const save = async () => {
    if (!connection) return;
    if (await onSave(connection.id, policyId === "none" ? null : Number(policyId))) onOpenChange(null);
  };
  const policy = policies.find((item) => String(item.id) === policyId);
  return <Dialog open={connection !== null} onOpenChange={(open) => { if (!open && !pending) onOpenChange(null); }}><DialogContent className="w-[min(94vw,520px)] p-5 sm:p-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-4 text-primary" />分配健康策略</DialogTitle><DialogDescription className="mt-1 text-sm text-muted">{connection ? `${connection.sourceSiteName} · ${connection.sourceGroupName}` : ""}</DialogDescription><div className="mt-5 space-y-4"><div className="space-y-2"><Label>健康策略</Label><Select ariaLabel="选择健康策略" value={policyId} options={[{ value: "none", label: "不监控" }, ...policies.map((item) => ({ value: String(item.id), label: item.name }))]} onValueChange={setPolicyId} /></div>{policy ? <div className="flex flex-wrap gap-1.5"><Tag tone={policy.enabled ? "success" : "neutral"}>{policy.enabled ? "启用" : "停用"}</Tag><Tag>每 {policy.intervalSeconds} 秒</Tag><Tag>失败 {policy.failureThreshold}</Tag><Tag>恢复 {policy.recoveryThreshold}</Tag></div> : null}</div><div className="mt-6 flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={pending}>取消</Button></DialogClose><Button type="button" disabled={pending} onClick={() => void save()}><Save className="size-4" />{pending ? "保存中" : "保存"}</Button></div><DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" disabled={pending} className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose></DialogContent></Dialog>;
}
