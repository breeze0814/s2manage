import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync("src/worker/monitor.ts", "utf8");

assert.match(workerSource, /runDueInviteActivitySettlements/, "Worker should run persisted invite activity settlements");
assert.match(workerSource, /auto_invite_activity_settlement/, "Worker should log invite activity settlement results");
