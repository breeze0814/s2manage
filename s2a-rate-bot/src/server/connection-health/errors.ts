import type { HealthProbeExecution } from "./types.ts";

export class HealthPolicyConflictError extends Error {}

export class HealthProbeError extends Error {
  constructor(message: string, readonly execution: HealthProbeExecution, options?: ErrorOptions) {
    super(message, options);
  }
}
