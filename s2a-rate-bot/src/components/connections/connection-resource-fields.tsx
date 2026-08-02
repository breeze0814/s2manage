"use client";

import { Database, Loader2, WandSparkles } from "lucide-react";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Select } from "../ui/select";
import type {
  ConnectionProvisioningMode, ConnectionResourceOptions,
} from "./types";

export function ProvisioningModeField(input: Readonly<{
  value: ConnectionProvisioningMode;
  onChange: (value: ConnectionProvisioningMode) => void;
}>) {
  return (
    <RadioGroup
      value={input.value}
      onValueChange={(value) => input.onChange(value as ConnectionProvisioningMode)}
      className="grid grid-cols-2 gap-2 sm:col-span-2"
    >
      <ModeOption value="managed" label="托管创建" icon={<WandSparkles className="size-4" />} />
      <ModeOption value="existing" label="绑定现有资源" icon={<Database className="size-4" />} />
    </RadioGroup>
  );
}

export function ExistingResourceFields(input: Readonly<{
  options: ConnectionResourceOptions;
  loading: boolean;
  sourceCredentialId: string;
  targetAccountId: string;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
}>) {
  if (input.loading) {
    return <div className="loading-state min-h-20 sm:col-span-2"><Loader2 className="size-4 animate-spin" />正在读取现有资源...</div>;
  }
  return (
    <>
      <ResourceField label="采集站凭据" empty={input.options.sourceCredentials.length === 0}>
        <Select
          ariaLabel="选择现有采集站凭据"
          value={input.sourceCredentialId}
          options={input.options.sourceCredentials.map((item) => ({ value: item.id, label: `${item.name} (#${item.id})` }))}
          onValueChange={input.onSourceChange}
        />
      </ResourceField>
      <ResourceField label="目标账号" empty={input.options.targetAccounts.length === 0}>
        <Select
          ariaLabel="选择现有目标账号"
          value={input.targetAccountId}
          options={input.options.targetAccounts.map((item) => ({ value: String(item.id), label: `${item.name} (#${item.id})` }))}
          onValueChange={input.onTargetChange}
        />
      </ResourceField>
    </>
  );
}

function ModeOption(input: Readonly<{
  value: ConnectionProvisioningMode;
  label: string;
  icon: React.ReactNode;
}>) {
  return (
    <Label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
      <RadioGroupItem value={input.value} className="sr-only" />
      {input.icon}<span className="text-sm font-medium">{input.label}</span>
    </Label>
  );
}

function ResourceField(input: Readonly<{
  label: string;
  empty: boolean;
  children: React.ReactNode;
}>) {
  return (
    <div className="space-y-2">
      <Label>{input.label}</Label>
      {input.empty ? <p className="flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-muted">无可用资源</p> : input.children}
    </div>
  );
}
