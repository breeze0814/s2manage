import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSqliteAppStorage } from "../src/storage/sqlite-app-storage.ts";

async function withStorage<T>(task: (storage: ReturnType<typeof createSqliteAppStorage>) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "s2a-rate-bot-storage-"));
  const storage = createSqliteAppStorage(`file:${join(dir, "app.db")}`);
  try {
    return await task(storage);
  } finally {
    storage.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("sqlite storage persists bot user bindings and reward grants", async () => {
  await withStorage(async (storage) => {
    const binding = await storage.upsertUserBinding({
      qqUserId: "712127095",
      sub2UserId: 21,
      sub2Email: "a@example.com",
      sub2SnapshotJson: JSON.stringify({ email: "a@example.com" }),
    });

    assert.equal((await storage.findBindingByQqUserId("712127095"))?.id, binding.id);
    assert.equal((await storage.findBindingBySub2UserId(21))?.qqUserId, "712127095");

    const grant = await storage.upsertInviteRewardGrant({
      periodStartDate: "2026-07-07",
      periodEndDate: "2026-07-10",
      inviterId: 21,
      inviterEmail: "a@example.com",
      inviterUsername: "Alice",
      activeInviteeCount: 1,
      inactiveInviteeCount: 0,
      totalInviteeCount: 1,
      rewardAmount: 10,
    });

    assert.equal(grant.status, "pending");
    assert.equal((await storage.findInviteRewardGrant("2026-07-07", 21))?.rewardAmount, 10);

    const issued = await storage.markInviteRewardIssued(grant.id, { id: 9001, code: "reward-code-21" });
    assert.equal(issued.status, "issued");
    assert.equal(issued.redeemCode, "reward-code-21");

    assert.equal((await storage.deleteUserBinding("712127095"))?.sub2UserId, 21);
    assert.equal(await storage.findBindingByQqUserId("712127095"), null);
  });
});

test("sqlite storage records recent runtime events", async () => {
  await withStorage(async (storage) => {
    await storage.recordRuntimeEvent({
      service: "bot",
      eventType: "napcat-connected",
      status: "success",
      message: "NapCat connected",
      metadata: { botUserId: "12345" },
    });
    await storage.recordRuntimeEvent({
      service: "worker",
      eventType: "cycle",
      status: "failed",
      message: "source failed",
      metadata: { failedSources: 1 },
    });

    const events = await storage.listRuntimeEvents({ limit: 5 });

    assert.equal(events.length, 2);
    assert.equal(events[0]?.service, "worker");
    assert.equal(events[0]?.status, "failed");
    assert.deepEqual(events[0]?.metadata, { failedSources: 1 });
    assert.equal(events[1]?.service, "bot");
  });
});
