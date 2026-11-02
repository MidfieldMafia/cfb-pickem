/**
 * The live heartbeat from the outside: the `Request` QStash sends in, the
 * `Response` it logs. Bound to the real `authorized()` and a PGlite database
 * over the published Week 2 fixture, so the claim it rides is the stale gate's
 * own `weeks.scoreboard_fetched_at`, not a stand-in.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authorized } from "@/app/api/cron/auth";
import { createTestDb } from "@/test/db";
import { feedWith, publishWeek2 } from "@/test/week-2";
import { liveHeartbeat, type HeartbeatRoute } from "./heartbeat";

const SECRET = "test-cron-secret";

/** Miami is past kickoff with no word from the feed: Due, so the gate would pull it. */
const FRIDAY = new Date("2026-09-11T01:00:00Z");

function ping(authorization?: string): Request {
  return new Request("https://slate.test/api/cron/live", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("the live heartbeat", () => {
  test("refuses a ping without the cron secret before any work", async () => {
    const { db } = await publishWeek2();
    const feed = feedWith({});
    const route: HeartbeatRoute = { db, cfbd: () => feed, authorized, now: FRIDAY };

    expect((await liveHeartbeat(ping(), route)).status).toBe(401);
    expect((await liveHeartbeat(ping("Bearer wrong-secret"), route)).status).toBe(401);
    expect(feed.calls).toBe(0);
  });

  test("pulls the feed when nobody has in thirty seconds, and does nothing inside the claim", async () => {
    const { db } = await publishWeek2();
    const feed = feedWith({});
    const at = (ms: number): HeartbeatRoute => ({ db, cfbd: () => feed, authorized, now: new Date(FRIDAY.getTime() + ms) });
    const authorization = `Bearer ${SECRET}`;

    const first = await liveHeartbeat(ping(authorization), at(0));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ week: 2, refreshed: true, outcome: "refreshed" });
    expect(feed.calls).toBe(1);

    // A member's poll or the last minute's ping holds the claim: one read, no feed call.
    expect(await (await liveHeartbeat(ping(authorization), at(29_000))).json()).toEqual({
      week: 2,
      refreshed: false,
      outcome: "fresh",
    });
    expect(feed.calls).toBe(1);

    // The next minute's ping finds the claim lapsed and pulls again.
    expect(await (await liveHeartbeat(ping(authorization), at(60_000))).json()).toMatchObject({ refreshed: true });
    expect(feed.calls).toBe(2);
  });

  test("answers idle when no Week is published", async () => {
    const db = await createTestDb();
    const response = await liveHeartbeat(ping(`Bearer ${SECRET}`), { db, cfbd: () => feedWith({}), authorized });
    expect(await response.json()).toEqual({ week: null, refreshed: false, outcome: "idle" });
  });
});
