/**
 * Web Push through its server seams: keeping a device's subscription, who a
 * Chat message and a Final go out to, what the banner says, and what happens
 * when a push service says a device is gone.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { pushSubscriptions, weeks } from "@/db/schema";
import { postMessage } from "@/lib/chat/chat";
import { ingestResults } from "@/lib/results/writes";
import { slateFor } from "@/lib/slate/slate";
import {
  familyGroup,
  feedWith,
  lockAs,
  FAMU_AT_MIAMI,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  pickAs,
  publishWeek2,
  SATURDAY_EVENING,
  seedWeek2,
  THURSDAY,
} from "@/test/week-2";
import { chatPreview, notifyChat } from "./chat-notify";
import { clockSeconds, closeAlerted, closeBody, isClose } from "./close-notify";
import { notifyFeedback, notifyRollCall } from "./console-notify";
import { finalBody, newlyFinal } from "./finals-notify";
import type { PushPayload } from "./payload";
import type { Pusher, PushTarget, SendOutcome } from "./sender";
import { pushConfigFromEnv } from "./sender";
import {
  commissionerDevices,
  deliver,
  InvalidSubscription,
  memberSubscriptions,
  removeSubscription,
  saveSubscription,
  setPreferences,
  subscribedDevices,
} from "./subscriptions";

const ON = { chat: true, finals: true, close: true, feedback: true, review: true, rollCall: true };
const only = (kind: keyof typeof ON) =>
  ({ ...Object.fromEntries(Object.keys(ON).map((k) => [k, false])), [kind]: true }) as typeof ON;

function device(n: number) {
  return {
    endpoint: `https://push.example/device-${n}`,
    keys: { p256dh: `p${n}`, auth: `a${n}` },
  };
}

/** A Pusher that records every send and answers as told, per endpoint. */
function recorder(answers: Record<string, SendOutcome> = {}) {
  const sent: { target: PushTarget; payload: PushPayload }[] = [];
  const pusher: Pusher = {
    async send(target, payload) {
      sent.push({ target, payload });
      return answers[target.endpoint] ?? "sent";
    },
  };
  return { pusher, sent };
}

describe("a device's subscription", () => {
  test("is kept by endpoint: subscribing again replaces the keys, not the row", async () => {
    const { db, grandma } = await seedWeek2();
    const first = await saveSubscription(db, grandma, device(1), ON, "iPhone");
    const again = await saveSubscription(
      db,
      grandma,
      { ...device(1), keys: { p256dh: "rotated", auth: "a1" } },
      ON,
      "iPhone",
    );

    expect(again.id).toBe(first.id);
    expect(again.p256dh).toBe("rotated");
    expect(await memberSubscriptions(db, grandma)).toHaveLength(1);
  });

  test("follows the member signed in: one endpoint, a new member, moves the row", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await saveSubscription(db, grandma, device(1), ON, null);
    await saveSubscription(db, jonah, device(1), ON, null);

    expect(await memberSubscriptions(db, grandma)).toHaveLength(0);
    expect((await memberSubscriptions(db, jonah)).map((d) => d.endpoint)).toEqual([device(1).endpoint]);
  });

  test("refuses anything that is not an https endpoint with both keys", async () => {
    const { db, grandma } = await seedWeek2();
    await expect(
      saveSubscription(db, grandma, { endpoint: "http://x", keys: device(1).keys }, ON, null),
    ).rejects.toThrow(InvalidSubscription);
    await expect(saveSubscription(db, grandma, { endpoint: device(1).endpoint }, ON, null)).rejects.toThrow(
      InvalidSubscription,
    );
    await expect(saveSubscription(db, grandma, null, ON, null)).rejects.toThrow(InvalidSubscription);
  });

  test("preferences and removal only touch the member's own devices", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await saveSubscription(db, grandma, device(1), ON, null);

    expect(await setPreferences(db, jonah, device(1).endpoint, { ...ON, chat: false })).toBeNull();
    expect((await setPreferences(db, grandma, device(1).endpoint, { ...ON, chat: false }))?.chat).toBe(false);

    await removeSubscription(db, jonah, device(1).endpoint);
    expect(await memberSubscriptions(db, grandma)).toHaveLength(1);
    await removeSubscription(db, grandma, device(1).endpoint);
    expect(await memberSubscriptions(db, grandma)).toHaveLength(0);
  });

  test("is chosen by kind, and an inactive member's devices sit out", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await saveSubscription(db, grandma, device(1), { ...ON, finals: false }, null);
    await saveSubscription(db, jonah, device(2), { ...ON, chat: false }, null);

    expect((await subscribedDevices(db, [grandma.id, jonah.id], "chat")).map((d) => d.endpoint)).toEqual([
      device(1).endpoint,
    ]);
    expect((await subscribedDevices(db, [grandma.id, jonah.id], "finals")).map((d) => d.endpoint)).toEqual([
      device(2).endpoint,
    ]);
    expect(await subscribedDevices(db, [], "chat")).toEqual([]);
  });
});

describe("delivery", () => {
  test("drops a device the push service says is gone, stamps the ones that took it, keeps a failed one", async () => {
    const { db, grandma } = await seedWeek2();
    await saveSubscription(db, grandma, device(1), ON, null);
    await saveSubscription(db, grandma, device(2), ON, null);
    await saveSubscription(db, grandma, device(3), ON, null);
    const { pusher } = recorder({
      [device(2).endpoint]: "gone",
      [device(3).endpoint]: "failed",
    });
    const payload: PushPayload = {
      title: "t",
      body: "b",
      url: "/",
      tag: "x",
      badge: null,
    };

    const delivery = await deliver(db, pusher, await memberSubscriptions(db, grandma), () => payload, THURSDAY);

    expect(delivery).toEqual({ sent: 1, gone: 1, failed: 1 });
    const rows = await db.select().from(pushSubscriptions).orderBy(pushSubscriptions.endpoint);
    expect(rows.map((r) => [r.endpoint, r.lastSentAt])).toEqual([
      [device(1).endpoint, THURSDAY],
      [device(3).endpoint, null],
    ]);
  });
});

describe("a Chat message", () => {
  test("goes to the rest of the Group, not the author, with their unread count as the badge", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    const family = await familyGroup(db);
    await saveSubscription(db, grandma, device(1), ON, null);
    await saveSubscription(db, jonah, device(2), ON, null);
    const { pusher, sent } = recorder();

    await postMessage(db, jonah, family.id, "Kickoff is at 11.", THURSDAY);
    const message = await postMessage(db, jonah, family.id, "Roll   Tide.\nSee you there.", THURSDAY);
    const delivery = await notifyChat(db, pusher, jonah, family.id, message, THURSDAY);

    expect(delivery.sent).toBe(1);
    expect(sent.map((s) => s.target.endpoint)).toEqual([device(1).endpoint]);
    expect(sent[0].payload).toEqual({
      title: family.name,
      body: "Jonah: Roll Tide. See you there.",
      url: "/chat",
      tag: `chat-${family.id}`,
      badge: 2,
    });
  });

  test("skips devices that turned Chat off, and sends nothing when push is not configured", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    const family = await familyGroup(db);
    await saveSubscription(db, grandma, device(1), { ...ON, chat: false }, null);
    const { pusher, sent } = recorder();
    const message = await postMessage(db, jonah, family.id, "Hey.", THURSDAY);

    expect(await notifyChat(db, pusher, jonah, family.id, message, THURSDAY)).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(await notifyChat(db, null, jonah, family.id, message, THURSDAY)).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(sent).toEqual([]);
  });

  test("previews a long message on one line, cut to a banner's length", () => {
    expect(chatPreview("  a \n b  ")).toBe("a b");
    const long = "x".repeat(200);
    expect(chatPreview(long)).toHaveLength(140);
    expect(chatPreview(long).endsWith("…")).toBe(true);
  });
});

describe("a Final", () => {
  const texasGame = {
    id: 1,
    homeTeamId: 251,
    homeTeam: "Texas",
    awayTeamId: 194,
    awayTeam: "Ohio State",
  } as unknown as Parameters<typeof finalBody>[0]["game"];

  test("says the score winner-first, and how the member's pick came out", () => {
    const final = { game: texasGame, homeScore: 28, awayScore: 31 };
    expect(finalBody(final, null, false)).toBe("Final: Ohio State 31, Texas 28.");
    expect(finalBody(final, 194, false)).toBe("Final: Ohio State 31, Texas 28. Your pick Ohio State wins ✓.");
    expect(finalBody(final, 251, true)).toBe("Final: Ohio State 31, Texas 28. Your Lock pick Texas misses ✗.");
    expect(finalBody({ game: texasGame, homeScore: 21, awayScore: 21 }, 251, false)).toBe(
      "Final: Ohio State 21, Texas 21. Your pick Texas pushes.",
    );
  });

  test("is only a game that just went final: not one still pending, not one already final", () => {
    const games = [
      { ...texasGame, id: 1 },
      { ...texasGame, id: 2 },
      { ...texasGame, id: 3 },
    ];
    const before = (g: { id: number }) => ({
      status: g.id === 2 ? "final" : "pending",
    });
    const after = (g: { id: number }) =>
      g.id === 3
        ? { status: "in_progress", homeScore: 7, awayScore: 0 }
        : { status: "final", homeScore: 28, awayScore: 31 };
    expect(newlyFinal(games, before, after).map((f) => f.game.id)).toEqual([1]);
  });

  test("goes out from an ingest that settles a game, once, with each member's own pick in it", async () => {
    const { db, week, slate, jonah, grandma, texas, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY); // Ohio State
    await lockAs(db, grandma, slate, texas.id, THURSDAY);
    await pickAs(db, jonah, slate, texas, texas.homeTeamId, THURSDAY); // Texas
    await saveSubscription(db, grandma, device(1), ON, null);
    await saveSubscription(db, jonah, device(2), { ...ON, finals: false, review: false }, null);
    const { pusher, sent } = recorder();

    const feed = feedWith({ [OHIO_STATE_AT_TEXAS]: [31, 28] });
    await ingestResults(db, feed, await slateFor(db, week.id), SATURDAY_EVENING, pusher);
    // The same score again is a no-op, not a second banner.
    await ingestResults(db, feed, await slateFor(db, week.id), SATURDAY_EVENING, pusher);

    expect(sent).toHaveLength(1);
    expect(sent[0].target.endpoint).toBe(device(1).endpoint);
    expect(sent[0].payload).toEqual({
      title: "Ohio State at Texas",
      body: "Final: Ohio State 31, Texas 28. Your Lock pick Ohio State wins ✓.",
      url: "/live",
      tag: `final-${texas.id}`,
      badge: null,
    });
    expect(
      (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, jonah.id)))[0].lastSentAt,
    ).toBeNull();

    // A second game going final later is its own banner.
    await ingestResults(
      db,
      feedWith({
        [OHIO_STATE_AT_TEXAS]: [31, 28],
        [OKLAHOMA_AT_MICHIGAN]: [24, 27],
      }),
      await slateFor(db, week.id),
      SATURDAY_EVENING,
      pusher,
    );
    expect(sent).toHaveLength(2);
    expect(sent[1].payload.tag).toBe(`final-${michigan.id}`);
    expect(sent[1].payload.body).toBe("Final: Michigan 27, Oklahoma 24.");
  });
});

describe("configuration", () => {
  test("is all three settings or nothing", () => {
    expect(pushConfigFromEnv({})).toBeNull();
    expect(
      pushConfigFromEnv({
        WEB_PUSH_PUBLIC_KEY: "p",
        WEB_PUSH_PRIVATE_KEY: "k",
      }),
    ).toBeNull();
    expect(
      pushConfigFromEnv({
        WEB_PUSH_PUBLIC_KEY: " p ",
        WEB_PUSH_PRIVATE_KEY: "k",
        WEB_PUSH_SUBJECT: "mailto:a@b",
      }),
    ).toEqual({
      publicKey: "p",
      privateKey: "k",
      subject: "mailto:a@b",
    });
  });
});

describe("a commissioner", () => {
  test("hears about feedback, a result needing review, and the roll call; a member does not", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await saveSubscription(db, grandma, device(1), ON, null); // a member, every switch on
    await saveSubscription(db, jonah, device(2), ON, null); // the commissioner
    const { pusher, sent } = recorder();

    await notifyFeedback(db, pusher, grandma, "bug", "The Reveal shows the wrong week.", THURSDAY);
    await notifyRollCall(db, pusher, 2, [grandma, { displayName: "Uncle Rick" }], THURSDAY);

    expect(sent.map((s) => s.target.endpoint)).toEqual([device(2).endpoint, device(2).endpoint]);
    expect(sent[0].payload).toMatchObject({
      title: "Grandma sent a bug",
      body: "The Reveal shows the wrong week.",
      url: "/console/feedback",
    });
    expect(sent[1].payload).toMatchObject({
      title: "Week 2 roll call",
      body: "2 members haven't picked yet: Grandma, Uncle Rick.",
      url: "/console/picks",
    });
  });

  test("can turn each notice off on its own", async () => {
    const { db, jonah } = await seedWeek2();
    await saveSubscription(db, jonah, device(2), { ...ON, feedback: false }, null);
    expect(await commissionerDevices(db, "feedback")).toEqual([]);
    expect((await commissionerDevices(db, "review")).map((d) => d.endpoint)).toEqual([device(2).endpoint]);
  });

  test("is told once about a game the feed never settles, as it crosses the review line", async () => {
    const { db, week, jonah, texas } = await publishWeek2();
    await saveSubscription(db, jonah, device(2), ON, null);
    const { pusher, sent } = recorder();
    // Friday's and the early game are settled; only Texas stalls, so it is the only game that can cross the line.
    const stalled = feedWith(
      { [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] },
      { [OHIO_STATE_AT_TEXAS]: [14, 10, 4, "00:00"] },
    );
    const hoursAfter = (h: number) => new Date(texas.kickoff.getTime() + h * 3600_000);

    await ingestResults(db, stalled, await slateFor(db, week.id), hoursAfter(3), pusher);
    const reviews = () => sent.filter((x) => x.payload.tag === "review");
    expect(reviews()).toHaveLength(0);

    // Crossing the line: the week's last fetch was at 3 hours, this one is past 6.
    await db
      .update(weeks)
      .set({ scoreboardFetchedAt: hoursAfter(3) })
      .where(eq(weeks.id, week.id));
    await ingestResults(db, stalled, await slateFor(db, week.id), hoursAfter(7), pusher);
    expect(reviews()).toHaveLength(1);
    expect(reviews()[0].payload).toMatchObject({ title: "A result needs you", url: "/console/results" });
    expect(reviews()[0].payload.body).toContain("Ohio State at Texas still isn't final 6 hours after kickoff");

    // Already past the line at the last fetch: not again.
    await db
      .update(weeks)
      .set({ scoreboardFetchedAt: hoursAfter(7) })
      .where(eq(weeks.id, week.id));
    await ingestResults(db, stalled, await slateFor(db, week.id), hoursAfter(8), pusher);
    expect(reviews()).toHaveLength(1);
  });
});

describe("a close game", () => {
  test("is under two minutes in the fourth, one score, with the trailing team driving", () => {
    const at = (
      period: number | null,
      clock: string | null,
      home: number,
      away: number,
      possession: "home" | "away" | null,
      status = "in_progress",
    ) => isClose({ status, period, clock, homeScore: home, awayScore: away, possession } as never);
    expect(at(4, "1:58", 21, 24, "home")).toBe(true); // Texas trails by 3 with the ball
    expect(at(4, "0:07", 21, 29, "home")).toBe(true); // down 8 still counts: touchdown and two
    expect(at(4, "1:58", 21, 24, "away")).toBe(false); // the leader has the ball
    expect(at(4, "1:58", 21, 30, "home")).toBe(false); // down 9: two scores
    expect(at(4, "2:01", 21, 24, "home")).toBe(false); // not yet two minutes
    expect(at(4, "1:58", 24, 24, "home")).toBe(false); // tied: nobody is trailing
    expect(at(3, "1:58", 21, 24, "home")).toBe(false); // third quarter
    expect(at(5, "0:00", 21, 24, "home")).toBe(false); // overtime is untimed
    expect(at(4, null, 21, 24, "home")).toBe(false);
    expect(at(4, "1:58", 21, 24, null)).toBe(false);
    expect(at(4, "1:58", 21, 24, "home", "final")).toBe(false);
  });

  test("reads the clock as minutes and seconds", () => {
    expect(clockSeconds("1:58")).toBe(118);
    expect(clockSeconds("12:00")).toBe(720);
    expect(clockSeconds("0:07")).toBe(7);
    expect(clockSeconds("")).toBeNull();
    expect(clockSeconds(null)).toBeNull();
    expect(clockSeconds("Halftime")).toBeNull();
  });

  test("says who leads, the clock, who has the ball, and where the member's pick stands", () => {
    const game = { homeTeamId: 251, homeTeam: "Texas", awayTeamId: 194, awayTeam: "Ohio State" } as never;
    const close = { game, homeScore: 21, awayScore: 24, period: 4, clock: "1:58" };
    expect(closeBody(close, null, false)).toBe("Ohio State 24, Texas 21 — 4th · 1:58. Texas has the ball.");
    expect(closeBody(close, 194, false)).toBe(
      "Ohio State 24, Texas 21 — 4th · 1:58. Texas has the ball. Your pick Ohio State leads.",
    );
    expect(closeBody(close, 251, true)).toBe(
      "Ohio State 24, Texas 21 — 4th · 1:58. Texas has the ball. Your Lock pick Texas trails.",
    );
  });

  test("goes out once per game, the first time the trailing team is driving late, and not as the ball changes hands", async () => {
    const { db, week, slate, grandma, jonah, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY); // Ohio State
    await saveSubscription(db, grandma, device(1), ON, null);
    await saveSubscription(db, jonah, device(2), { ...ON, close: false, review: false, finals: false }, null);
    const { pusher, sent } = recorder();
    const settled = {
      [FAMU_AT_MIAMI]: [7, 45] as [number, number],
      [OKLAHOMA_AT_MICHIGAN]: [24, 27] as [number, number],
    };
    const closes = () => sent.filter((x) => x.payload.tag === `close-${texas.id}`);
    const texasAt = async (away: number, home: number, clock: string, possession: "home" | "away") =>
      ingestResults(
        db,
        feedWith(settled, { [OHIO_STATE_AT_TEXAS]: [away, home, 4, clock, { possession }] }),
        await slateFor(db, week.id),
        SATURDAY_EVENING,
        pusher,
      );

    // Fourth quarter, one score, but the leader has the ball: not yet.
    await texasAt(24, 21, "1:40", "away");
    expect(closes()).toHaveLength(0);
    expect(await closeAlerted(db, texas.id)).toBe(false);

    // Texas gets it back, trailing by three under two minutes: now, to Grandma only.
    await texasAt(24, 21, "1:12", "home");
    expect(closes()).toHaveLength(1);
    expect(closes()[0].target.endpoint).toBe(device(1).endpoint);
    expect(closes()[0].payload).toMatchObject({
      title: "Close game: Ohio State at Texas",
      body: "Ohio State 24, Texas 21 — 4th · 1:12. Texas has the ball. Your pick Ohio State leads.",
      url: "/live",
    });
    expect(await closeAlerted(db, texas.id)).toBe(true);

    // Texas scores and Ohio State is now the one driving: still one banner for this game.
    await texasAt(24, 28, "0:31", "away");
    expect(closes()).toHaveLength(1);
  });
});
