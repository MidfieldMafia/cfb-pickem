/**
 * Close game pushes (#531, rules on #493): the rule on the before/after edge
 * of one feed update, what the push says, and who it reaches. The rule runs on
 * plain rows; the send runs on PGlite through a recording push sender.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, memberships, pushSubscriptions, type Game, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { AFTER_KICKOFF, gameRow } from "@/test/game";
import { addGroup, joinAt, pickAs, publishWeek2, SATURDAY_EVENING, THURSDAY, TUESDAY } from "@/test/week-2";
import { closeMessage, newlyClose, pushCloseGames, type CloseColumns, type CloseGame } from "./close-game";
import type { Pusher, PushPayload, PushTarget } from "./sender";

/** Oklahoma at Michigan under way: Michigan 24, Oklahoma 21, Q3, Michigan's ball. Not close. */
const BEFORE: Partial<Game> = {
  status: "in_progress",
  homeScore: 24,
  awayScore: 21,
  period: 3,
  clock: "04:10",
  possession: "home",
};

/** The same game after an update: Q4 1:48, Oklahoma down 3 with the ball. Close. */
const CLOSE: CloseColumns = { status: "in_progress", homeScore: 24, awayScore: 21, period: 4, clock: "01:48", possession: "away" };

/** Whether one update from `before` to `after` makes the game newly close. */
function fires(after: Partial<CloseColumns>, before: Partial<Game> = BEFORE): boolean {
  const game = gameRow(before);
  return newlyClose([game], () => ({ ...CLOSE, ...after }), AFTER_KICKOFF).length === 1;
}

describe("the rule, on one update's edge", () => {
  test("fires when the trailing team, down one score, has the ball with 2:00 or less in the 4th", () => {
    expect(fires({})).toBe(true);
    expect(fires({ clock: "02:00" })).toBe(true);
    expect(fires({ clock: "00:15" })).toBe(true);
  });

  test("not with more than 2:00 left", () => {
    expect(fires({ clock: "02:01" })).toBe(false);
  });

  test("down 8 fires, down 9 does not", () => {
    expect(fires({ homeScore: 29, awayScore: 21 })).toBe(true);
    expect(fires({ homeScore: 30, awayScore: 21 })).toBe(false);
  });

  test("not while the leading team has the ball, or nobody is known to", () => {
    expect(fires({ possession: "home" })).toBe(false);
    expect(fires({ possession: null })).toBe(false);
  });

  test("never in overtime, and never in a tie", () => {
    expect(fires({ period: 5 })).toBe(false);
    expect(fires({ homeScore: 21, awayScore: 21 })).toBe(false);
  });

  test("never on a game that went final in the same update", () => {
    expect(fires({ status: "final", period: null, clock: null, possession: null })).toBe(false);
  });

  test("only on the edge: a game that was already close before the update does not fire again", () => {
    expect(fires({ clock: "01:20" }, { ...BEFORE, period: 4, clock: "01:48", possession: "away" })).toBe(false);
  });

  test("never on a Void game, whatever the feed says", () => {
    expect(fires({}, { ...BEFORE, void: true, voidNote: "Postponed" })).toBe(false);
  });

  test("a game the update did not reach stays as it was", () => {
    expect(newlyClose([gameRow(BEFORE)], () => undefined, AFTER_KICKOFF)).toEqual([]);
  });
});

describe("what it says", () => {
  const [close] = newlyClose([gameRow(BEFORE)], () => CLOSE, AFTER_KICKOFF);

  test("the trailing team first in the title, the clock and the ball in the body, and the member's pick", () => {
    expect(closeMessage(close, 130)).toEqual({
      title: "Close game: Oklahoma 21, Michigan 24",
      body: "1:48 left in the 4th, Oklahoma has the ball. You picked Michigan.",
      url: "/live?game=7",
      tag: "close-7",
    });
  });

  test("no last sentence for a member who did not pick the game", () => {
    expect(closeMessage(close, null).body).toBe("1:48 left in the 4th, Oklahoma has the ball.");
  });

  test("the clock as people say it", () => {
    const [late] = newlyClose([gameRow(BEFORE)], () => ({ ...CLOSE, clock: "00:15", homeScore: 14, awayScore: 21, possession: "home" }), AFTER_KICKOFF);
    expect(closeMessage(late, 201)).toEqual({
      title: "Close game: Michigan 14, Oklahoma 21",
      body: "0:15 left in the 4th, Michigan has the ball. You picked Oklahoma.",
      url: "/live?game=7",
      tag: "close-7",
    });
  });
});

interface Sent {
  endpoint: string;
  payload: PushPayload;
  ttl: number;
}

/** Records each send. */
function recorder(): Pusher & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(target: PushTarget, payload, { ttl }) {
      sent.push({ endpoint: target.endpoint, payload, ttl });
      return "sent";
    },
  };
}

const endpoint = (m: Pick<Member, "displayName">) => `https://web.push.apple.com/${m.displayName.toLowerCase().replace(/\W/g, "")}`;

async function device(db: Db, m: Member) {
  await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: endpoint(m), p256dh: "key", auth: "secret" });
}

/**
 * Week 2 published; Ohio State at Texas close: Texas 21, Ohio State 24, 1:48
 * left, Texas's ball. Jonah picked Ohio State, Grandma nothing; Katie is only
 * in another group and picked Texas; Tom has no phone.
 */
async function seedClose() {
  const fixture = await publishWeek2();
  const { db, jonah, grandma, slate, texas } = fixture;
  const other = await addGroup(db, "Office");
  const katie = await joinAt(db, jonah, "Katie", TUESDAY);
  // Moved to the other group, so she shares none with the rest.
  await db.update(memberships).set({ groupId: other.id }).where(eq(memberships.memberId, katie.id));
  const tom = await joinAt(db, jonah, "Tom", TUESDAY);
  for (const m of [jonah, grandma, katie]) await device(db, m);
  await pickAs(db, jonah, slate, texas, texas.awayTeamId, THURSDAY);
  await pickAs(db, katie, slate, texas, texas.homeTeamId, THURSDAY);
  const close: CloseGame = { game: texas, homeScore: 21, awayScore: 24, seconds: 108 };
  const push = recorder();
  const to = (m: Member) => push.sent.filter((s) => s.endpoint === endpoint(m));
  return { ...fixture, katie, tom, close, push, to };
}

describe("who it reaches", () => {
  test("every member with Close games on and a phone, whatever their group, with their own pick, for ten minutes", async () => {
    const { db, jonah, grandma, katie, tom, close, push, to, texas } = await seedClose();

    await pushCloseGames(db, push, [close], SATURDAY_EVENING);

    const message = { title: "Close game: Texas 21, Ohio State 24", url: `/live?game=${texas.id}`, tag: `close-${texas.id}` };
    expect(to(jonah)).toEqual([
      { endpoint: endpoint(jonah), ttl: 600, payload: { ...message, body: "1:48 left in the 4th, Texas has the ball. You picked Ohio State." } },
    ]);
    expect(to(katie).map((s) => s.payload.body)).toEqual(["1:48 left in the 4th, Texas has the ball. You picked Texas."]);
    expect(to(grandma).map((s) => s.payload.body)).toEqual(["1:48 left in the 4th, Texas has the ball."]);
    expect(to(tom)).toEqual([]);
  });

  test("nothing to a member who turned Close games off", async () => {
    const { db, grandma, close, push, to } = await seedClose();
    await db.update(members).set({ notifyCloseGames: false }).where(eq(members.id, grandma.id));

    await pushCloseGames(db, push, [close], SATURDAY_EVENING);

    expect(to(grandma)).toEqual([]);
  });

  test("once per game: a second update that finds it close again sends nothing", async () => {
    const { db, close, push } = await seedClose();

    await pushCloseGames(db, push, [close], SATURDAY_EVENING);
    const first = push.sent.length;
    const again = await pushCloseGames(db, push, [{ ...close, seconds: 40 }], SATURDAY_EVENING);

    expect(first).toBe(3);
    expect(again).toEqual([]);
    expect(push.sent.length).toBe(3);
  });
});
