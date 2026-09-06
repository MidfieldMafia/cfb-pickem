import { describe, expect, test } from "vitest";
import { recordedCfbd, recordings } from "@/lib/cfbd/recorded";
import { savePick, setLock } from "@/lib/picks/picks";
import {
  FAMU_AT_MIAMI,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  seedWeek2,
} from "@/test/week-2";
import {
  addGame,
  InvalidSlate,
  openWeek,
  publishedSlate,
  publishSlate,
  refreshFromFeed,
  removeGame,
  setDeadline,
  setTiebreaker,
  slateFor,
  SlatePublished,
  voidGame,
} from "./slate";

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
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    await savePick(db, grandma, week.id, famu.id, famu.homeTeamId, THURSDAY_BEFORE);
    await setLock(db, grandma, week.id, famu.id, THURSDAY_BEFORE);
    await voidGame(db, jonah, famu.id, "Hurricane");

    expect(await db.query.locks.findMany()).toHaveLength(1);
    await expect(removeGame(db, jonah, famu.id)).rejects.toBeInstanceOf(SlatePublished);
  });

  test("only a commissioner can touch the slate", async () => {
    const { db, jonah, grandma, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);

    await expect(openWeek(db, grandma, 2)).rejects.toThrow(/commissioner/);
    await expect(addGame(db, grandma, week.id, candidate(OHIO_STATE_AT_TEXAS))).rejects.toThrow(/commissioner/);
    await expect(publishSlate(db, grandma, week.id)).rejects.toThrow(/commissioner/);
  });

  test("a kickoff change in the feed updates the game but keeps it on the slate and leaves the deadline", async () => {
    const { db, jonah, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);
    const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
    await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    await setTiebreaker(db, jonah, week.id, texas.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    const moved = recordings["2026-week-2"].games.map((g) =>
      g.id === OKLAHOMA_AT_MICHIGAN ? { ...g, startDate: "2026-09-13T00:00:00.000Z" } : g,
    );
    const changed = await refreshFromFeed(db, recordedCfbd("2026-week-2", { games: moved }), week.id);

    expect(changed).toBe(1);
    const slate = await slateFor(db, week.id);
    expect(slate.games.map((g) => `${g.awayTeam} ${g.kickoff.toISOString()}`)).toEqual([
      "Ohio State 2026-09-12T23:30:00.000Z",
      "Oklahoma 2026-09-13T00:00:00.000Z",
    ]);
    expect(slate.deadline?.toISOString()).toBe("2026-09-12T16:00:00.000Z");
  });

  test("a game carries its pick-screen detail from the feed, and the refresh updates it even after publish", async () => {
    const { db, jonah, candidate } = await setup();
    const week = await openWeek(db, jonah, 2);
    const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
    expect(michigan.detail).toMatchObject({
      venue: "Michigan Stadium",
      city: "Ann Arbor, MI",
      tv: "FOX",
      homeWp: 0.568,
      spread: "Oklahoma -1.5",
      home: { rank: 16, record: "1–0", pointsFor: 13 },
      away: { rank: 10, record: "1–0", pointsFor: 51 },
    });

    await setTiebreaker(db, jonah, week.id, michigan.id);
    await publishSlate(db, jonah, week.id, TUESDAY_BEFORE);

    // The forecast moves during the week; nothing else about the game changed.
    const rainy = recordings["2026-week-2"].weather.map((w) =>
      w.id === OKLAHOMA_AT_MICHIGAN ? { ...w, temperature: 61.2, weatherConditionCode: 8, weatherCondition: "Rain" } : w,
    );
    expect(await refreshFromFeed(db, recordedCfbd("2026-week-2", { weather: rainy }), week.id)).toBe(1);
    const slate = await slateFor(db, week.id);
    expect(slate.games[0].detail?.weather).toMatchObject({ temperature: 61, icon: "cloud-rain" });
    // A second refresh with the same feed changes nothing.
    expect(await refreshFromFeed(db, recordedCfbd("2026-week-2", { weather: rainy }), week.id)).toBe(0);
  });
});
