import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseJsonLogTail } from "../src/server/logging/log-reader.ts";
import { readHeartbeatStatus, writeHeartbeatSnapshot } from "../src/server/worker/heartbeat.ts";

test("log tail skips byte-boundary fragments and an actively appended final fragment", () => {
  const content = Buffer.from([
    "partial-prefix\n",
    '{"id":2,"status":"success"}\n',
    '{"id":3,"status":"failed"}\n',
    '{"id":4',
  ].join(""));

  assert.deepEqual(parseJsonLogTail(content, { truncatedAtStart: true }), [
    { id: 2, status: "success" },
    { id: 3, status: "failed" },
  ]);
});

test("log tail still exposes malformed complete JSON entries", () => {
  const content = Buffer.from('{"id":1}\nnot-json\n');
  assert.throws(() => parseJsonLogTail(content, { truncatedAtStart: false }), /日志第 2 行不是有效 JSON/);
});

test("heartbeat snapshots always leave a complete JSON document", async () => {
  const directory = await mkdtemp(join(tmpdir(), "s2a-heartbeat-"));
  try {
    await Promise.all(Array.from({ length: 20 }, (_, index) => writeHeartbeatSnapshot(directory, {
      timestamp: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      pid: index,
    })));
    const heartbeat = await readHeartbeatStatus(directory, new Date(2026, 0, 1, 0, 1, 0));
    assert.equal(heartbeat.connected, true);
    assert.equal(heartbeat.pid, 19);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
