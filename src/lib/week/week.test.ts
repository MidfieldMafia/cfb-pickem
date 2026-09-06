import { describe, expect, test } from "vitest";
import { recordedCfbd, recordings } from "@/lib/cfbd/recorded";
import type { CfbdClient, CfbdGame } from "@/lib/cfbd/types";
import { savePick, setLock, setTiebreakerGuess } from "@/lib/picks/picks";
import { openWeek } from "@/lib/slate/slate";
import { OKLAHOMA_AT_MICHIGAN, publishWeek2, seedWeek2, SUNDAY, THURSDAY } from "@/test/week-2";
import { currentWeek } from "./week";

/** Michigan reported final. `calls` counts feed reads, so a test can prove the gate held. */
function feedWithMichiganFinal(): CfbdClient & { calls: number } {
  const feedGames: CfbdGame[] = recordings["2026-week-2"].games.map((g) =>
    g.id === OKLAHOMA_AT_MICHIGAN ? { ...g, completed: true, awayPoints: 24, homePoints: 27 } : g,
  );
  const inner = recordedCfbd("2026-week-2", { games: feedGames });
  const client = {
    ...inner,
    calls: 0,
    games: async (q: { year: number; week: number }) => {
      client.calls += 1;
      return inner.games(q);
    },
  };
  return client;
}

const angryFeed = (): CfbdClient => {
  throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
};

describe("the current week", () => {
  test("is null until a slate is published, whatever weeks exist", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    expect(await currentWeek(db, grandma, THURSDAY)).toBeNull();

    // An open but unpublished Week is still no Week for a member: one shape, not a throw.
    await openWeek(db, jonah, 2);
    expect(await currentWeek(db, grandma, THURSDAY)).toBeNull();
  });

  test("carries the published slate and the member's own sheet before the deadline", async () => {
    const { db, grandma, week, michigan, texas } = await publishWeek2();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 55, THURSDAY);

    const current = (await currentWeek(db, grandma, THURSDAY))!;
    expect(current.slate.week.id).toBe(week.id);
    expect(current.slate.games).toHaveLength(3);
    expect(current.locked).toBe(false);
    expect(current.sheet.locked).toBe(false);
    expect(current.sheet.picks.map((p) => p.gameId)).toEqual([michigan.id]);
    expect(current.sheet.lockGameId).toBe(michigan.id);
    expect(current.sheet.tiebreakerGuess).toBe(55);
    expect(current.slate.week.tiebreakerGameId).toBe(texas.id);

    // The Reveal is never open before the Deadline, asked for or not.
    expect(current.reveal).toBeNull();
    expect((await currentWeek(db, grandma, THURSDAY, { reveal: true }))!.reveal).toBeNull();
  });

  test("opens the reveal after the deadline, and only for the screen that asks", async () => {
    const { db, jonah, grandma, week, michigan } = await publishWeek2();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY);

    // Locked, but nobody asked: the Reveal costs a read per member, so it stays unbuilt.
    const quiet = (await currentWeek(db, grandma, SUNDAY))!;
    expect(quiet.locked).toBe(true);
    expect(quiet.reveal).toBeNull();

    const shown = (await currentWeek(db, grandma, SUNDAY, { reveal: true }))!;
    expect(shown.reveal!.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    const michiganRow = shown.reveal!.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => p.memberId).sort()).toEqual([jonah.id, grandma.id].sort());
  });

  test("pulls the feed before grading, so the reveal never shows the scores it walked in with", async () => {
    const { db, grandma, week, michigan } = await publishWeek2();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    const feed = feedWithMichiganFinal();

    const graded = (await currentWeek(db, grandma, SUNDAY, { reveal: true, cfbd: () => feed }))!;
    expect(feed.calls).toBe(1);
    const michiganRow = graded.reveal!.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.result).toEqual({
      status: "final",
      awayScore: 24,
      homeScore: 27,
      source: "feed",
      live: null,
      label: "Final",
    });
    expect(michiganRow.picks.map((p) => p.outcome)).toEqual(["correct"]);
    // The Slate handed back is the refreshed one, not the rows the read started from.
    expect(graded.slate.games.find((g) => g.id === michigan.id)).toMatchObject({ status: "final", homeScore: 27 });

    // The stale gate still bounds it: a second visit inside the interval does not call again.
    await currentWeek(db, grandma, SUNDAY, { reveal: true, cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });

  test("a feed that will not answer leaves the week readable with the scores it had", async () => {
    const { db, grandma, week, michigan } = await publishWeek2();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);

    const current = (await currentWeek(db, grandma, SUNDAY, { reveal: true, cfbd: angryFeed }))!;
    expect(current.locked).toBe(true);
    expect(current.reveal!.games.find((g) => g.game.id === michigan.id)!.result.status).toBe("pending");
  });
});
