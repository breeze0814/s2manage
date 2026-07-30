import { Loader2 } from "lucide-react";
import type {
  AccountGroupOption,
  AccountSourceBinding,
  AccountSourceRate,
  AccountSourceSite,
  TargetAccountView,
} from "./types";

export function AccountInfo({ label, children, wide = false }: Readonly<{
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}>) {
  return <div className={wide ? "sm:col-span-2" : ""}>
    <dt className="mb-1 text-xs text-muted">{label}</dt>
    <dd>{children}</dd>
  </div>;
}

export function LoadingAccounts() {
  return <div className="loading-state">
    <Loader2 className="size-4 animate-spin" />
    正在读取本地账号快照...
  </div>;
}

export type AccountActionProps = {
  readonly account: TargetAccountView;
  readonly groups: ReadonlyMap<number, AccountGroupOption>;
  readonly rates: readonly AccountSourceRate[];
  readonly sites: readonly AccountSourceSite[];
  readonly testing: boolean;
  readonly bindingPending: boolean;
  readonly bindingDisabled: boolean;
  readonly scheduling: boolean;
  readonly onBind: (account: TargetAccountView, binding: AccountSourceBinding | null) => Promise<boolean>;
  readonly onTest: (account: TargetAccountView) => void;
  readonly onSchedule: (account: TargetAccountView) => void;
};

export type AccountListProps = Readonly<{
  accounts: readonly TargetAccountView[];
  groups: readonly AccountGroupOption[];
  rates: readonly AccountSourceRate[];
  sites: readonly AccountSourceSite[];
  testPendingIds: readonly number[];
  bindingPendingId: number | null;
  schedulePendingId: number | null;
  onBind: AccountActionProps["onBind"];
  onTest: AccountActionProps["onTest"];
  onSchedule: AccountActionProps["onSchedule"];
}>;
