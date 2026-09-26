import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { games } from "@/db/schema";
import { recordedCfbd, recordings } from "@/lib/cfbd/recorded";
import {
  FAMU_AT_MIAMI,
  lockAs,
  pickAs,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  SATURDAY_EVENING,
  seedWeek2,
  SUNDAY,
} from "@/test/week-2";
import {
  addGame,
  InvalidSlate,
  openWeek,
  publishedSlate,
  publishSlate,
  refreshFromFeed,
  refreshUpcomingSlates,
  removeGame,
  setDeadline,
  setTiebreaker,
  slateFor,
  SlatePublished,
} from "./slate";
import { voidGame } from "@/lib/results/writes";

const TUESDAY_BEFORE = new Date("2026-09-08T18:00:00Z");
const THURSDAY_BEFORE = new Date("2026-09-10T20:00:00Z");

const setup = seedWeek2;

describe("slate builder", () => {
  test("a commissioner builds a week's slate from candidates and publishes it as a whole", async () => {
    const { db, jonah, candidate } = await setup();

    const week = await openWeek(db, jonah, 2);
    expect(await publishedSlate(db)).toBeNull();

    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    await setTiebreaker(db, jonah, week.id, texas.id);

    let slate = await slateFor(db, week.id);
    expect(slate.week.published).toBe(false);
    expect(slate.games.map((g) => g.awayTeam)).toEqual(["Oklahoma", "Ohio State"]);
    expect(slate.deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");
    expect(await publishedSlate(db)).toBeNull();

    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    slate = await slateFor(db, week.id);
    expect(slate.week.published).toBe(true);
    expect(slate.week.tiebreakerGameId).toBe(texas.id);
    const live = await publishedSlate(db);
    expect(live?.week.weekNumber).toBe(2);
    expect(live?.games.map((g) => `${g.awayTeam} at ${g.homeTeam}`)).toEqual([
      "Oklahoma at Michigan",
      "Ohio State at Texas",
    ]);
    expect(live?.games[1]).toMatchObject({ awayRank: 1, homeRank: 5, spread: "Texas -1.5" });
  });

  test("the deadline defaults to the earliest kickoff and can move earlier, never later", async () => {
    const { db, jonah, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);
    expect((await slateFor(db, week.id)).deadline).toBeNull();

    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    expect((await slateFor(db, week.id)).deadline?.toISOString()).toBe("2026-09-12T23:30:00.000Z");

    // Adding an earlier game pulls the default earlier.
    await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    expect((await slateFor(db, week.id)).deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");

    await expect(setDeadline(db, jonah, week.id, new Date("2026-09-12T17:00:00Z"))).rejects.toThrow(/earlier/);
    await setDeadline(db, jonah, week.id, new Date("2026-09-12T12:00:00Z"));
    expect((await slateFor(db, week.id)).deadline?.toISOString()).toBe("2026-09-12T12:00:00.000Z");

    await setTiebreaker(db, jonah, week.id, texas.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    // Published: the deadline is frozen and only moves earlier.
    await expect(setDeadline(db, jonah, week.id, new Date("2026-09-12T13:00:00Z"))).rejects.toThrow(/earlier/);
    await setDeadline(db, jonah, week.id, new Date("2026-09-12T11:00:00Z"));
    expect((await slateFor(db, week.id)).deadline?.toISOString()).toBe("2026-09-12T11:00:00.000Z");
  });

  test("publishing needs a game, a tiebreaker, and a deadline still in the future", async () => {
    const { db, jonah, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);

    await expect(publishSlate(db, jonah, week.id, TUESDAY_BEFORE)).rejects.toThrow(/at least one game/);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    await expect(publishSlate(db, jonah, week.id, TUESDAY_BEFORE)).rejects.toThrow(/Tiebreaker/);
    await setTiebreaker(db, jonah, week.id, texas.id);
    await expect(publishSlate(db, jonah, week.id, new Date("2026-09-13T00:00:00Z"))).rejects.toThrow(/passed/);
    expect((await publishSlate(db, jonah, week.id, TUESDAY_BEFORE)).week.published).toBe(true);
  });

  test("before publish a game is removed; after publish it can only be voided, with a note", async () => {
    const { db, jonah, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    const famu = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));

    await removeGame(db, jonah, famu.id);
    expect((await slateFor(db, week.id)).games).toHaveLength(2);
    await expect(voidGame(db, jonah, texas.id, "Hurricane")).rejects.toThrow(/published/);

    await setTiebreaker(db, jonah, week.id, texas.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    await expect(removeGame(db, jonah, michigan.id)).rejects.toBeInstanceOf(SlatePublished);
    await expect(voidGame(db, jonah, michigan.id, "  ")).rejects.toThrow(/note/);
    await voidGame(db, jonah, michigan.id, "Postponed for weather");

    const slate = await slateFor(db, week.id);
    expect(slate.games).toHaveLength(2);
    expect(slate.games.find((g) => g.id === michigan.id)).toMatchObject({ void: true, voidNote: "Postponed for weather" });
    // Voiding the earliest game does not move the frozen deadline.
    expect(slate.deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");
    await expect(setTiebreaker(db, jonah, week.id, michigan.id)).rejects.toBeInstanceOf(InvalidSlate);
  });

  test("a game carrying a Dropped Lock cannot be removed", async () => {
    // A Void now leaves the Lock row in place, and locks.game_id is ON DELETE NO ACTION, so a game
    // deletion under a surviving Lock would raise a foreign key error. Two rules keep them apart:
    // removeGame refuses on a published slate, and picks and locks only exist once a slate is published.
    const { db, jonah, grandma, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    const famu = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
    await setTiebreaker(db, jonah, week.id, texas.id);
    const slate = await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    await pickAs(db, grandma, slate, famu, famu.homeTeamId, THURSDAY_BEFORE);
    await lockAs(db, grandma, slate, famu.id, THURSDAY_BEFORE);
    await voidGame(db, jonah, famu.id, "Hurricane");

    expect(await db.query.locks.findMany()).toHaveLength(1);
    await expect(removeGame(db, jonah, famu.id)).rejects.toBeInstanceOf(SlatePublished);
  });

  // Only a commissioner can touch the slate is no longer this module's own
  // runtime check: `openWeek`, `addGame`, and `publishSlate` all take a
  // `Commissioner`, so passing `grandma` here is a type error, not a
  // rejection to assert on. See `members/authority.ts` and
  // `picks/edits.test.ts`'s `asCommissioner` coverage for where the check
  // that mints one still lives.

  test("a kickoff change in the feed updates the game but keeps it on the slate and leaves the deadline", async () => {
    const { db, jonah, candidate, rain } = await setup();
    const week = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    await setTiebreaker(db, jonah, week.id, texas.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    const moved = recordings["2026-week-2"].games.map((g) =>
      g.id === OKLAHOMA_AT_MICHIGAN ? { ...g, startDate: "2026-09-13T00:00:00.000Z" } : g,
    );
    const changed = await refreshFromFeed(
      db,
      jonah,
      recordedCfbd("2026-week-2", { games: moved }),
      week.id,
      rain,
      TUESDAY_BEFORE,
    );

    expect(changed).toBe(1);
    const slate = await slateFor(db, week.id);
    expect(slate.games.map((g) => `${g.awayTeam} ${g.kickoff.toISOString()}`)).toEqual([
      "Ohio State 2026-09-12T23:30:00.000Z",
      "Oklahoma 2026-09-13T00:00:00.000Z",
    ]);
    expect(slate.deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");
  });

  test("a game carries its pick-screen detail from the feed, and the refresh updates it even after publish", async () => {
    const { db, jonah, candidate, rain } = await setup();
    const week = await openWeek(db, jonah, 2);
    const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    expect(michigan.detail).toMatchObject({
      venue: "Michigan Stadium",
      city: "Ann Arbor, MI",
      tv: "FOX",
      homeWp: 0.568,
      spread: "Oklahoma -1.5",
      // Open-Meteo's 8% at kickoff: the seeded week runs with the forecast on,
      // so a game stored here carries the same detail production would store.
      weather: { temperature: 83, precipitation: 8 },
      home: { rank: 16, record: "1–0", pointsFor: 13 },
      away: { rank: 10, record: "1–0", pointsFor: 51 },
    });

    await setTiebreaker(db, jonah, week.id, michigan.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    // The forecast moves during the week; nothing else about the game changed.
    const rainy = recordings["2026-week-2"].weather.map((w) =>
      w.id === OKLAHOMA_AT_MICHIGAN ? { ...w, temperature: 61.2, weatherConditionCode: 8, weatherCondition: "Rain" } : w,
    );
    expect(await refreshFromFeed(db, jonah, recordedCfbd("2026-week-2", { weather: rainy }), week.id, rain, TUESDAY_BEFORE)).toBe(1);
    const slate = await slateFor(db, week.id);
    expect(slate.games[0].detail?.weather).toMatchObject({ temperature: 61, icon: "cloud-rain" });
    // A second refresh with the same feed changes nothing.
    expect(await refreshFromFeed(db, jonah, recordedCfbd("2026-week-2", { weather: rainy }), week.id, rain, TUESDAY_BEFORE)).toBe(0);
  });
  test("after publish the refresh moves the spread and ranks too, and each game freezes at its own kickoff", async () => {
    const { db, jonah, candidate, rain } = await setup();
    const week = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    await setTiebreaker(db, jonah, week.id, texas.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    // The line moves on both games and a new poll unranks everyone.
    const moved = recordedCfbd("2026-week-2", {
      lines: recordings["2026-week-2"].lines.map((g) =>
        g.id === OHIO_STATE_AT_TEXAS || g.id === OKLAHOMA_AT_MICHIGAN
          ? { ...g, lines: [{ ...g.lines[0], spread: -7, formattedSpread: g.id === OHIO_STATE_AT_TEXAS ? "Texas -7" : "Michigan -7" }] }
          : g,
      ),
      rankings: [],
    });
    const byTeam = async () =>
      Object.fromEntries((await slateFor(db, week.id)).games.map((g) => [g.homeTeam, g]));

    // Saturday evening: Michigan kicked off at 16:00, Texas is still to come.
    expect(await refreshFromFeed(db, jonah, moved, week.id, rain, SATURDAY_EVENING)).toBe(1);
    let rows = await byTeam();
    expect(rows.Texas).toMatchObject({ spread: "Texas -7", homeRank: null, awayRank: null });
    expect(rows.Texas.detail?.spread).toBe("Texas -7");
    // Michigan is frozen whole: kickoff, spread, ranks and detail as they were.
    expect(rows.Michigan).toMatchObject({
      kickoff: michigan.kickoff,
      spread: michigan.spread,
      homeRank: michigan.homeRank,
      awayRank: michigan.awayRank,
      detail: michigan.detail,
    });

    // The same feed before kickoff reaches Michigan as well.
    expect(await refreshFromFeed(db, jonah, moved, week.id, rain, TUESDAY_BEFORE)).toBe(1);
    rows = await byTeam();
    expect(rows.Michigan).toMatchObject({ spread: "Michigan -7", homeRank: null, awayRank: null });
    expect((await slateFor(db, week.id)).deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");
  });
});

describe("the daily refresh", () => {
  test("refreshes every Week with a game still to kick off, each Week failing alone", async () => {
    const { db, jonah, candidate, rain } = await setup();
    await openWeek(db, jonah, 1);
    const week2 = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week2.id, candidate(OHIO_STATE_AT_TEXAS));
    await setTiebreaker(db, jonah, week2.id, texas.id);
    await publishSlate(db, jonah, week2.id, TUESDAY_BEFORE);
    // Week 3 carries a game too, and its feed will not answer.
    const week3 = await openWeek(db, jonah, 3);
    await addGame(db, jonah, week3.id, candidate(OKLAHOMA_AT_MICHIGAN));
    await db.update(games).set({ spread: "stale" }).where(eq(games.id, texas.id));

    const recorded = recordedCfbd("2026-week-2");
    const cfbd = {
      ...recorded,
      games: async (query: { year: number; week: number }) => {
        if (query.week === 3) throw new Error("CFBD is down");
        return recorded.games(query);
      },
    };

    // Week 1 has no games, so it is not read at all.
    expect(await refreshUpcomingSlates(db, cfbd, rain, TUESDAY_BEFORE)).toEqual([
      { weekNumber: 2, changed: 1 },
      { weekNumber: 3, error: "CFBD is down" },
    ]);
    expect((await slateFor(db, week2.id)).games[0].spread).toBe("Texas -1.5");

    // Once every game has kicked off, there is nothing left to refresh.
    expect(await refreshUpcomingSlates(db, cfbd, rain, SUNDAY)).toEqual([]);
  });
});
