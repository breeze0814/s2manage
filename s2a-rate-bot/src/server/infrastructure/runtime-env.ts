const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

export type InfrastructureEnvironment = Readonly<{
  postgresUrl: string;
  redisUrl: string;
}>;

export function infrastructureEnvironment(env: NodeJS.ProcessEnv): InfrastructureEnvironment {
  return {
    postgresUrl: requiredConnectionUrl("POSTGRES_URL", env.POSTGRES_URL, POSTGRES_PROTOCOLS),
    redisUrl: requiredConnectionUrl("REDIS_URL", env.REDIS_URL, REDIS_PROTOCOLS),
  };
}

function requiredConnectionUrl(name: string, value: string | undefined, protocols: ReadonlySet<string>) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid connection URL`); }
  if (!protocols.has(parsed.protocol)) throw new Error(`${name} uses an unsupported protocol`);
  if (!parsed.hostname) throw new Error(`${name} must include a hostname`);
  return value;
}
