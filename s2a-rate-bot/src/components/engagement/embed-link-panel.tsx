"use client";

import { Check, Copy, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { ConfirmAlert } from "../ui/confirm-alert";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { requestJson } from "./api";

type Kind = "tickets" | "leaderboard" | "lottery" | "compensation";
type Config = { readonly embedToken: string; readonly config: Record<string, unknown>; readonly updatedAt: string };

export function EmbedLinkPanel({ kind }: Readonly<{ kind: Kind }>) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void loadConfig(kind, setConfig, setLoading); }, [kind]);
  const url = config && typeof window !== "undefined" ? embedUrl(kind, config.embedToken) : "";
  const rotate = () => void rotateToken(kind, setConfig, setLoading, setConfirming);
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div><h2 className="panel-title">嵌入链接</h2><p className="panel-description">将此地址配置到 Sub2API 的 iframe 嵌入项</p></div>
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary-strong"><KeyRound className="size-5" aria-hidden="true" /></span>
      </div>
      <div className="space-y-3 p-4 lg:p-5">
        <Label className="block" htmlFor={`${kind}-embed-url`}>iframe 地址</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id={`${kind}-embed-url`} readOnly value={loading ? "正在生成链接…" : url} className="min-w-0 flex-1 font-mono text-xs" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1 sm:flex-none" disabled={!url || loading} onClick={() => void copyUrl(url, setCopied)}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制"}
            </Button>
            <Button type="button" variant="secondary" className="flex-1 sm:flex-none" disabled={!url || loading} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-4" />预览
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs leading-5 text-muted">轮换后旧链接与已签发会话立即失效。</p>
          <Button type="button" variant="secondary" className="shrink-0" disabled={loading} onClick={() => setConfirming(true)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}轮换密钥
          </Button>
        </div>
      </div>
      <ConfirmAlert open={confirming} onOpenChange={setConfirming} title="轮换嵌入密钥？" description="旧 iframe 地址会立即失效，需要同步更新 Sub2API 配置。" confirmLabel="确认轮换" onConfirm={rotate} />
    </section>
  );
}

async function loadConfig(kind: Kind, setConfig: (value: Config) => void, setLoading: (value: boolean) => void) {
  setLoading(true);
  try { setConfig(await requestJson<Config>(`/api/embeds/${kind}/config`)); }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { setLoading(false); }
}

async function rotateToken(kind: Kind, setConfig: (value: Config) => void, setLoading: (value: boolean) => void, setConfirming: (value: boolean) => void) {
  setConfirming(false); setLoading(true);
  try {
    setConfig(await requestJson<Config>(`/api/embeds/${kind}/config`, { method: "POST", body: JSON.stringify({ action: "rotate" }) }));
    toast.success("嵌入密钥已轮换");
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { setLoading(false); }
}

async function copyUrl(url: string, setCopied: (value: boolean) => void) {
  await navigator.clipboard.writeText(url); setCopied(true); toast.success("嵌入地址已复制");
  window.setTimeout(() => setCopied(false), 2_000);
}

function embedUrl(kind: Kind, token: string) { const url = new URL(`/embed/${kind}`, window.location.origin); url.searchParams.set("embed_token", token); return url.toString(); }
