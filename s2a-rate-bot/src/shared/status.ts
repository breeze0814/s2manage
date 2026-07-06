export type ServiceStatus = {
  readonly name: string;
  readonly state: "ready" | "not_configured" | "not_implemented";
  readonly detail: string;
};

export function buildStatus(input: { readonly databaseUrl: string | null }): ServiceStatus[] {
  return [
    {
      name: "api",
      state: "ready",
      detail: "pub UI and JSON status API are available",
    },
    {
      name: "worker",
      state: input.databaseUrl ? "ready" : "not_configured",
      detail: input.databaseUrl
        ? "sub2 source collection and target group rule worker are available"
        : "DATABASE_URL is required before worker orchestration can run",
    },
    {
      name: "bot",
      state: input.databaseUrl ? "not_implemented" : "not_configured",
      detail: input.databaseUrl
        ? "bot entry exists; NapCat adapter is not wired yet"
        : "DATABASE_URL is required before bot orchestration can run",
    },
  ];
}
