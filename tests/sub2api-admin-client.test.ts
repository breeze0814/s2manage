import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Sub2ApiAdminClient } from "../src/server/clients/sub2api-admin";

type CapturedRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

async function startServer(handler: (req: CapturedRequest) => Promise<{ status: number; body: unknown }>) {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      const captured: CapturedRequest = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const response = await handler(captured);
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(response.body));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected test server address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

void (async () => {
  const userServer = await startServer(async (req) => {
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/api/v1/admin/users?page=1&page_size=50&status=&role=&search=xhc0812320%40gmail.com");
    assert.equal(req.headers["x-api-key"], "test-key");
    assert.equal(req.headers.accept, "application/json");
    return {
      status: 200,
      body: {
        code: 0,
        message: "success",
        data: {
          items: [
            {
              id: 67,
              email: "xhc0812320@gmail.com",
              username: "",
              role: "user",
              balance: 2,
              concurrency: 5,
              status: "active",
            },
          ],
          total: 1,
          page: 1,
          page_size: 50,
          pages: 1,
        },
      },
    };
  });

  const redeemServer = await startServer(async (req) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/v1/admin/redeem-codes/generate");
    assert.equal(req.headers["x-api-key"], "test-key");
    assert.equal(req.headers["content-type"], "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse(req.body), { count: 1, type: "balance", value: 10 });
    return {
      status: 200,
      body: {
        code: 0,
        message: "success",
        data: [
          {
            id: 318,
            code: "baba95a6ac42883bf7a5c97b45898be8",
            type: "balance",
            value: 10,
            status: "unused",
          },
        ],
      },
    };
  });

  try {
    const userClient = new Sub2ApiAdminClient(userServer.baseUrl, "test-key");
    const users = await userClient.searchUsers({ search: "xhc0812320@gmail.com" });

    assert.equal(users.total, 1);
    assert.equal(users.page, 1);
    assert.equal(users.page_size, 50);
    assert.equal(users.pages, 1);
    assert.equal(users.items[0]?.email, "xhc0812320@gmail.com");

    const redeemClient = new Sub2ApiAdminClient(redeemServer.baseUrl, "test-key");
    const redeemCodes = await redeemClient.generateRedeemCodes({ count: 1, type: "balance", value: 10 });

    assert.equal(redeemCodes.length, 1);
    assert.equal(redeemCodes[0]?.code, "baba95a6ac42883bf7a5c97b45898be8");
    assert.equal(redeemCodes[0]?.value, 10);
  } finally {
    await Promise.all([userServer.close(), redeemServer.close()]);
  }
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
