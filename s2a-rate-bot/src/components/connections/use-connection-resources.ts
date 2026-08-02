"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, errorMessage } from "./api";
import type {
  ConnectionGroupType, ConnectionProvisioningMode, ConnectionResourceOptions,
} from "./types";

const EMPTY_OPTIONS: ConnectionResourceOptions = {
  sourceCredentials: [],
  targetAccounts: [],
};

export function useConnectionResources(input: Readonly<{
  open: boolean;
  mode: ConnectionProvisioningMode;
  sourceSiteId: string;
  sourceGroupId: string;
  groupType: ConnectionGroupType;
  targetGroupIds: ReadonlySet<number>;
}>) {
  const [state, setState] = useState<ResourceState>({
    options: EMPTY_OPTIONS,
    loading: false,
    error: null,
  });
  const { open, mode, sourceSiteId, sourceGroupId, groupType } = input;
  const targetKey = useMemo(() => [...input.targetGroupIds].sort((left, right) => left - right).join(","), [input.targetGroupIds]);
  useEffect(() => {
    if (!shouldLoad({ open, mode, sourceSiteId, sourceGroupId, targetKey })) {
      setState({ options: EMPTY_OPTIONS, loading: false, error: null });
      return;
    }
    let active = true;
    setState({ options: EMPTY_OPTIONS, loading: true, error: null });
    void loadResources(sourceSiteId, targetKey)
      .then((options) => {
        if (active) setState({ options: filterOptions(options, { sourceGroupId, groupType, targetKey }), loading: false, error: null });
      })
      .catch((error) => {
        if (active) setState({ options: EMPTY_OPTIONS, loading: false, error: errorMessage(error) });
      });
    return () => { active = false; };
  }, [groupType, mode, open, sourceGroupId, sourceSiteId, targetKey]);
  return state;
}

async function loadResources(sourceSiteId: string, targetKey: string) {
  const query = new URLSearchParams({ sourceSiteId, targetGroupIds: targetKey });
  return apiRequest<ConnectionResourceOptions>(`/api/connections/resources?${query}`);
}

function filterOptions(
  options: ConnectionResourceOptions,
  filters: Readonly<{ sourceGroupId: string; groupType: ConnectionGroupType; targetKey: string }>,
): ConnectionResourceOptions {
  const targetIds = filters.targetKey.split(",").map(Number);
  return {
    sourceCredentials: options.sourceCredentials.filter((item) => item.groupId === filters.sourceGroupId),
    targetAccounts: options.targetAccounts.filter((item) => (
      item.platform.trim().toLowerCase() === filters.groupType
      && targetIds.every((id) => item.groupIds.includes(id))
    )),
  };
}

function shouldLoad(input: Readonly<{
  open: boolean;
  mode: ConnectionProvisioningMode;
  sourceSiteId: string;
  sourceGroupId: string;
  targetKey: string;
}>) {
  return input.open && input.mode === "existing"
    && Boolean(input.sourceSiteId && input.sourceGroupId && input.targetKey);
}

type ResourceState = Readonly<{
  options: ConnectionResourceOptions;
  loading: boolean;
  error: string | null;
}>;
