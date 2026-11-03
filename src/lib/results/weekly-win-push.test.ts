/**
 * The Weekly Win push (#532, rules on #493) through the server seam: the
 * 16:00 UTC job's `runWeeklyWinPush` against the published Week 2, with the
 * feed it updates results from and a recording push sender. A pending game,
 * a win on points, on the tiebreaker and a tie, a re-run and a correction,
 * a member in two groups, and a group nobody played.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, pushSubscriptions, type Game, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { addMember } from "@/lib/groups/console";
import type { Pusher, PushPayload, PushTarget } from "@/lib/push/sender";
import {
  addGroup,
  ALL_FINAL,
  familyGroup,
  feedWith,
  FAMU_AT_MIAMI,
  guessAs,
  joinAt,
  joinGroup,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  pickAs,
  publishWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import { overrideResult } from "./writes";
import { runWeeklyWinPush, weeklyWinBody } from "./weekly-win-push";

interface Sent {
  endpoint: string;
  payload: PushPayload;
}

function pusher(): Pusher & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(target: PushTarget, payload) {
      sent.push({ endpoint: target.endpoint, payload });
      return "sent";
    },
  };
}

const endpoint = (m: Pick<Member, "id">) => `https://web.push.apple.com/member-${m.id}`;

async function device(db: Db, m: Member) {
  await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: endpoint(m), p256dh: "key", auth: "secret" });
}

/** Every Week 2 winner, the side that wins in `ALL_FINAL`. */
const winnerOf = (game: Game) => (game.cfbdGameId === OHIO_STATE_AT_TEXAS ? game.awayTeamId : game.homeTeamId);
/** The side that loses in `ALL_FINAL`. */
const loserOf = (game: Game) => (game.cfbdGameId === OHIO_STATE_AT_TEXAS ? game.homeTeamId : game.awayTeamId);

/** Week 2 published, Jonah and Grandma each with a phone, and a run the suite can call. */
async function seed() {
  const fixture = await publishWeek2();
  const { db, jonah, grandma } = fixture;
  for (const m of [jonah, grandma]) await device(db, m);
  const push = pusher();
  /** `who` picks every game, the winner of each unless it is named in `wrong`. */
  const pickAll = async (who: Member, wrong: Game[] = []) => {
    for (const game of [fixture.miami, fixture.michigan, fixture.texas]) {
      const team = wrong.some((g) => g.id === game.id) ? loserOf(game) : winnerOf(game);
      await pickAs(db, who, fixture.slate, game, team, THURSDAY);
    }
  };
  const run = (feed = feedWith(ALL_FINAL), at = SUNDAY) => runWeeklyWinPush(db, push, () => feed, at);
  const to = (m: Member) => push.sent.filter((s) => s.endpoint === endpoint(m)).map((s) => s.payload);
  return { ...fixture, push, pickAll, run, to };
}

describe("a Week still pending", () => {
  test("sends nothing, after updating results from the feed, and the next run sends once it is settled", async () => {
    const { pickAll, jonah, grandma, miami, run, push } = await seed();
    await pickAll(jonah);
    await pickAll(grandma, [miami]);

    const michiganOnly = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27], [FAMU_AT_MIAMI]: [7, 45] });
    const first = await run(michiganOnly);

    expect(first).toEqual({ ran: false, why: "a game is still pending" });
    expect(michiganOnly.calls).toBeGreaterThan(0);
    expect(push.sent).toEqual([]);

    const second = await run(feedWith(ALL_FINAL), new Date(SUNDAY.getTime() + 24 * 3600_000));
    expect(second.ran).toBe(true);
    expect(push.sent).toHaveLength(2);
  });
});

describe("a Week settled", () => {
  test("a win on points: the group reads who won, the winner reads their own line", async () => {
    const { db, pickAll, jonah, grandma, miami, run, to } = await seed();
    await pickAll(jonah);
    await pickAll(grandma, [miami]);

    await run();

    const family = (await familyGroup(db)).id;
    const link = `/go?group=${family}&to=/leaderboard?week=2`;
    expect(to(grandma)).toEqual([
      { title: "Week 2 in Mabry Family", body: "Jonah won with 30 points.", url: link, tag: `win-2-${family}` },
    ]);
    expect(to(jonah)).toEqual([
      { title: "Week 2 in Mabry Family", body: "You won Week 2 with 30 points.", url: link, tag: `win-2-${family}` },
    ]);
  });

  test("a win on the tiebreaker", async () => {
    const { db, slate, pickAll, jonah, grandma, run, to } = await seed();
    await pickAll(jonah);
    await pickAll(grandma);
    await guessAs(db, jonah, slate, 59, THURSDAY);
    await guessAs(db, grandma, slate, 40, THURSDAY);

    await run();

    expect(to(grandma).map((p) => p.body)).toEqual(["Jonah won on the tiebreaker."]);
    expect(to(jonah).map((p) => p.body)).toEqual(["You won Week 2 with 30 points."]);
  });

  test("a tie is a shared Weekly Win, and each winner reads their own line", async () => {
    const { db, slate, jonah, grandma, miami, pickAll, run, to } = await seed();
    const katie = await joinAt(db, jonah, "Katie", TUESDAY);
    await device(db, katie);
    await pickAll(jonah);
    await pickAll(grandma);
    await pickAs(db, katie, slate, miami, loserOf(miami), THURSDAY);

    await run();

    expect(to(katie).map((p) => p.body)).toEqual(["Jonah and Grandma share the Weekly Win."]);
    expect(to(jonah).map((p) => p.body)).toEqual(["You won Week 2 with 30 points."]);
    expect(to(grandma).map((p) => p.body)).toEqual(["You won Week 2 with 30 points."]);
  });

  test("a re-run, and a correction after the push, never send again", async () => {
    const { db, jonah, grandma, miami, pickAll, run, push } = await seed();
    await pickAll(jonah);
    await pickAll(grandma, [miami]);

    await run();
    expect(push.sent).toHaveLength(2);

    await run();
    await overrideResult(db, jonah, miami.id, { homeScore: 7, awayScore: 45, note: "Feed had it backwards" }, SUNDAY);
    const later = await run(feedWith(ALL_FINAL), new Date(SUNDAY.getTime() + 24 * 3600_000));

    expect(later.ran).toBe(true);
    expect(push.sent).toHaveLength(2);
  });

  test("a member in two groups gets one push for each", async () => {
    const { db, jonah, grandma, miami, pickAll, run, to } = await seed();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await pickAll(jonah);
    await pickAll(grandma, [miami]);

    await run();

    expect(to(grandma)).toEqual([
      expect.objectContaining({ title: "Week 2 in Mabry Family", body: "Jonah won with 30 points." }),
      expect.objectContaining({ title: "Week 2 in Cousins", body: "You won Week 2 with 20 points.", tag: `win-2-${cousins.id}` }),
    ]);
  });

  test("a group where nobody played sends nothing, and nor does a member with Weekly Win off or no device", async () => {
    const { db, jonah, grandma, pickAll, run, push, to } = await seed();
    const quiet = await addGroup(db, "Quiet");
    const sam = await addMember(db, jonah, quiet.id, { displayName: "Sam", phone: "+12565559902" });
    await device(db, sam);
    const tom = await joinAt(db, jonah, "Tom", TUESDAY);
    await db.update(members).set({ notifyWeeklyWin: false }).where(eq(members.id, grandma.id));
    await pickAll(jonah);

    const result = await run();

    expect(to(sam)).toEqual([]);
    expect(to(grandma)).toEqual([]);
    expect(to(tom)).toEqual([]);
    expect(push.sent.map((s) => s.endpoint)).toEqual([endpoint(jonah)]);
    expect(result.ran && result.sent.map((s) => s.memberId)).toEqual([jonah.id]);
  });
});

describe("weeklyWinBody", () => {
  const katie = { id: 1, displayName: "Katie" };
  const jimmy = { id: 2, displayName: "Jimmy" };
  const ann = { id: 3, displayName: "Ann" };
  const win = (decidedBy: "points" | "tiebreaker" | "shared", winners = [katie], points = 14) => ({ winners, points, decidedBy });

  test("the three bodies, and the winner's own", () => {
    expect(weeklyWinBody(win("points"), 9, jimmy.id)).toBe("Katie won with 14 points.");
    expect(weeklyWinBody(win("tiebreaker"), 9, jimmy.id)).toBe("Katie won on the tiebreaker.");
    expect(weeklyWinBody(win("shared", [katie, jimmy]), 9, ann.id)).toBe("Katie and Jimmy share the Weekly Win.");
    expect(weeklyWinBody(win("shared", [katie, jimmy, ann]), 9, 99)).toBe("Katie, Jimmy and Ann share the Weekly Win.");
    expect(weeklyWinBody(win("points"), 9, katie.id)).toBe("You won Week 9 with 14 points.");
  });
});
