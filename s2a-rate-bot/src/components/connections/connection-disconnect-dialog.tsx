"use client";

import { Loader2, Unplug, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import type { ConnectionView } from "./types";

export function ConnectionDisconnectDialog({ connection, pending, onOpenChange, onDisconnect }: Readonly<{
  connection: ConnectionView | null;
  pending: boolean;
  onOpenChange: (connection: ConnectionView | null) => void;
  onDisconnect: (connection: ConnectionView, mode: "unlink" | "full", removePricing: boolean) => Promise<boolean>;
}>) {
  const [mode, setMode] = useState<"unlink" | "full">("unlink");
  const [removePricing, setRemovePricing] = useState(true);
  useEffect(() => { if (connection) { setMode(connection.canDeleteRemote ? "full" : "unlink"); setRemovePricing(connection.pricingMappingEnabled); } }, [connection]);
  const submit = async () => {
    if (connection && await onDisconnect(connection, mode, removePricing)) onOpenChange(null);
  };
  return <Dialog open={connection !== null} onOpenChange={(open) => { if (!open && !pending) onOpenChange(null); }}><DialogContent className="w-[min(94vw,560px)] p-5 sm:p-6"><DialogTitle className="flex items-center gap-2 text-lg font-semibold"><Unplug className="size-4 text-danger" />断开真实连接</DialogTitle><DialogDescription className="mt-1 text-sm text-muted">{connection ? `${connection.sourceSiteName} · ${connection.sourceGroupName}` : ""}</DialogDescription><RadioGroup className="mt-5" value={mode} onValueChange={(value) => setMode(value as "unlink" | "full")}><DisconnectOption value="unlink" title="仅解除本地连接" detail="保留采集站凭据和目标转发账号" /><DisconnectOption value="full" title="完整删除远端资源" detail="删除采集站凭据和目标转发账号" disabled={!connection?.canDeleteRemote} /></RadioGroup><Label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3"><Checkbox checked={removePricing} onCheckedChange={(checked) => setRemovePricing(checked === true)} /><span className="text-sm font-medium">同时移除调价映射</span></Label>{mode === "full" ? <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">完整删除会调用两个远端站点，删除后不可恢复。</p> : null}<div className="mt-6 flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="secondary" disabled={pending}>取消</Button></DialogClose><Button type="button" variant="destructive" disabled={pending} onClick={() => void submit()}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}{mode === "full" ? "完整删除" : "解除连接"}</Button></div><DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" disabled={pending} className="absolute right-4 top-4 text-muted"><X className="size-3.5" /></Button></DialogClose></DialogContent></Dialog>;
}

function DisconnectOption({ value, title, detail, disabled = false }: Readonly<{ value: string; title: string; detail: string; disabled?: boolean }>) {
  return <Label className={`flex min-h-16 items-center gap-3 rounded-lg border border-border px-4 py-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-surface-muted/50"}`}><RadioGroupItem value={value} disabled={disabled} /><span><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs text-muted">{detail}</span></span></Label>;
}
