"use client";

import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TicketEmbedSettings, TicketTemplate } from "../../server/embeds/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { requestJson } from "./api";

type Config = { readonly config: Record<string, unknown> };
const TEMPLATE_OPTIONS = [{ value: "default", label: "标准" }, { value: "minimal", label: "简洁" }, { value: "support", label: "客服" }] as const;

export function TicketConfigPanel() {
  const [settings, setSettings] = useState<TicketEmbedSettings | null>(null);
  const [categories, setCategories] = useState("");
  const [priorities, setPriorities] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void loadSettings(setSettings, setCategories, setPriorities); }, []);
  const save = () => void saveSettings({ settings, categories, priorities, setSettings, setSaving });
  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div><h2 className="panel-title">工单表单设置</h2><p className="panel-description">控制嵌入端模板、附件和选项</p></div>
        <SlidersHorizontal className="size-5 text-primary" aria-hidden="true" />
      </div>
      {settings ? (
        <div className="grid gap-4 p-4 lg:grid-cols-2 lg:p-5">
          <Field label="界面模板">
            <Select ariaLabel="界面模板" value={settings.template} options={TEMPLATE_OPTIONS} onValueChange={(value) => setSettings({ ...settings, template: value as TicketTemplate })} />
          </Field>
          <Field label="每单最多图片">
            <Input type="number" min={0} max={6} value={settings.maxImagesPerTicket}
              onChange={(event) => setSettings({ ...settings, maxImagesPerTicket: Number(event.target.value) })} />
          </Field>
          <Field label="问题分类（每行一个）"><Textarea className="min-h-28 resize-y" value={categories} onChange={(event) => setCategories(event.target.value)} /></Field>
          <Field label="优先级（每行一个）"><Textarea className="min-h-28 resize-y" value={priorities} onChange={(event) => setPriorities(event.target.value)} /></Field>
          <div className="lg:col-span-2 lg:text-right">
            <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存表单设置
            </Button>
          </div>
        </div>
      ) : <div className="loading-state m-4"><Loader2 className="size-4 animate-spin" />读取设置…</div>}
    </section>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <Label className="block"><span className="mb-1.5 block">{label}</span>{children}</Label>;
}

async function loadSettings(
  setSettings: (value: TicketEmbedSettings) => void,
  setCategories: (value: string) => void,
  setPriorities: (value: string) => void,
) {
  try {
    const response = await requestJson<Config>("/api/embeds/tickets/config");
    const settings = response.config as TicketEmbedSettings;
    setSettings(settings); setCategories(settings.categoryOptions.join("\n")); setPriorities(settings.priorityOptions.join("\n"));
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
}

async function saveSettings(input: Readonly<{
  settings: TicketEmbedSettings | null; categories: string; priorities: string;
  setSettings: (value: TicketEmbedSettings) => void; setSaving: (value: boolean) => void;
}>) {
  if (!input.settings) return;
  input.setSaving(true);
  try {
    const body = { ...input.settings, categoryOptions: lines(input.categories), priorityOptions: lines(input.priorities) };
    const response = await requestJson<Config>("/api/embeds/tickets/config", { method: "PATCH", body: JSON.stringify(body) });
    input.setSettings(response.config as TicketEmbedSettings); toast.success("工单表单设置已保存");
  } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  finally { input.setSaving(false); }
}

function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
