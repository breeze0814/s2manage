import type { ConnectionStore } from "../connections/store.ts";
import type { ConnectionHealthGateway } from "../connections/types.ts";
import type { RuntimeLeaseStore } from "../runtime-leases/store.ts";
import type { ConnectionHealthStore } from "./store.ts";

export type HealthContext = Readonly<{
  store: ConnectionHealthStore;
  connections: ConnectionStore;
  gateway: ConnectionHealthGateway;
  leases: RuntimeLeaseStore;
  leaseId: () => string;
  now: () => Date;
  concurrency: () => Promise<number>;
}>;
