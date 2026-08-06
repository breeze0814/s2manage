import { createClient, type RedisClientType } from "redis";

export type RuntimeRedis = Readonly<{
  client: RedisClientType;
  ready: Promise<RedisClientType>;
  close: () => Promise<void>;
}>;

export function createRuntimeRedis(url: string): RuntimeRedis {
  const client = createClient({ url });
  client.on("error", (error) => console.error("[redis]", error));
  const ready = client.connect();
  return {
    client,
    ready,
    close: async () => {
      await ready;
      await client.close();
    },
  };
}
