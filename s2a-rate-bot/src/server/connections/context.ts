import type { RuntimeLeaseStore } from "../runtime-leases/store.ts";
import type { ConnectionStore } from "./store.ts";
import type {
  ConnectionGroupType, ConnectionRemoteGateway, ConnectionSourceRate,
  ConnectionSourceSite, ConnectionTargetGroup,
} from "./types.ts";

export type ConnectionContext = Readonly<{
  store: ConnectionStore;
  remote: ConnectionRemoteGateway;
  sources: Readonly<{
    sites: () => Promise<readonly ConnectionSourceSite[]>;
    rates: () => Promise<readonly ConnectionSourceRate[]>;
    setGroupType: (siteId: number, groupId: string, groupType: ConnectionGroupType) => Promise<unknown>;
  }>;
  pricing: Readonly<{
    groups: () => Promise<readonly ConnectionTargetGroup[]>;
    save: (input: unknown) => Promise<unknown>;
  }>;
  health: Readonly<{ release: (connectionId: string) => Promise<unknown> }>;
  leases: RuntimeLeaseStore;
  id: () => string;
  leaseId: () => string;
  now: () => Date;
  concurrency: () => Promise<number>;
}>;
