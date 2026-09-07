/**
 * The seam between a `PickSheet` of Drizzle rows and the object the browser
 * holds. Built from a real sheet rather than a hand-written one, so a column
 * that changes type shows up here as a failing date rather than as `[object
 * Object]` on a phone.
 */
import { describe, expect, test } from "vitest";
import { pickSheet, savePick, setLock, setTiebreakerGuess } from "@/lib/picks/picks";
import { slateFor, voidGame } from "@/lib/slate/slate";
import { publishWeek2, SUNDAY, THURSDAY } from "@/test/week-2";
import { toSheetJson, teamName } from "./json";

/** Grandma's Week 2 sheet, serialized, at a given moment. */
async function sheetAt(now = THURSDAY) {
  const fixture = await publishWeek2();
  const { db, grandma, week } = fixture;
  const read = async (at: Date) => toSheetJson(await pickSheet(db, grandma, await slateFor(db, week.id), at));
  return { ...fixture, read, json: await read(now) };
}

describe("toSheetJson", () => {
  test("carries the Week's identity and both clocks as ISO strings", async () => {
    const { json, week, deadline, texas } = await sheetAt();

    expect(json).toMatchObject({
      weekId: week.id,
      weekNumber: 2,
      year: 2026,
      deadline: deadline.toISOString(),
      serverNow: THURSDAY.toISOString(),
      locked: false,
      tiebreakerGameId: texas.id,
    });
    // Every date is a string on the wire; nothing reaches a screen as a Date.
    expect(typeof json.deadline).toBe("string");
    expect(typeof json.serverNow).toBe("string");
  });

  test("games keep slate order and carry the shared Game shape, plus the pick screen's detail", async () => {
    const { json, miami, michigan, texas } = await sheetAt();

    expect(json.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);
    const [first] = json.games;
    expect(first.game).toEqual({
      id: miami.id,
      awayTeamId: miami.awayTeamId,
      awayTeam: miami.awayTeam,
      awayRank: miami.awayRank,
      homeTeamId: miami.homeTeamId,
      homeTeam: miami.homeTeam,
      homeRank: miami.homeRank,
      kickoff: miami.kickoff.toISOString(),
      spread: miami.spread,
    });
    // Void is the result's word, not a field of its own on the Game.
    expect(first.game).not.toHaveProperty("void");
    expect(first.result).toMatchObject({ status: "pending", label: "Scheduled", shown: null });
    expect("detail" in first).toBe(true);
    // The join key stays on the server: no screen can reach the feed's id.
    expect(first.game).not.toHaveProperty("cfbdGameId");
  });

  test("picks, the Lock, and the Guess come through as the member left them", async () => {
    const { db, grandma, week, michigan, texas, read } = await sheetAt();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 55, THURSDAY);

    const json = await read(THURSDAY);

    expect(json.picks).toEqual([
      { gameId: michigan.id, teamId: michigan.homeTeamId, updatedAt: THURSDAY.toISOString() },
      { gameId: texas.id, teamId: texas.awayTeamId, updatedAt: THURSDAY.toISOString() },
    ]);
    expect(json.lockGameId).toBe(michigan.id);
    expect(json.lockDropped).toBe(false);
    expect(json.tiebreakerGuess).toBe(55);
  });

  test("a sheet with nothing entered is empty rather than absent", async () => {
    const { json } = await sheetAt();

    expect(json.picks).toEqual([]);
    expect(json.lockGameId).toBe(null);
    expect(json.tiebreakerGuess).toBe(null);
    expect(json.lockDropped).toBe(false);
  });

  test("the progress count travels with the sheet, so no screen counts it again", async () => {
    const { db, grandma, week, miami, michigan, texas, read } = await sheetAt();

    expect((await read(THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 0,
      lockSet: false,
      guessSet: false,
      remaining: 3,
    });

    await savePick(db, grandma, week.id, miami.id, miami.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 55, THURSDAY);

    expect((await read(THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 3,
      lockSet: true,
      guessSet: true,
      remaining: 0,
    });
  });

  test("a Dropped Lock is marked, and the void game says why", async () => {
    const { db, jonah, grandma, week, michigan, read } = await sheetAt();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    await voidGame(db, jonah, michigan.id, "Lightning; no makeup.");

    const json = await read(THURSDAY);

    expect(json.lockGameId).toBe(michigan.id);
    expect(json.lockDropped).toBe(true);
    expect(json.games.find((g) => g.game.id === michigan.id)!.result).toMatchObject({
      status: "void",
      label: "Void",
      note: "Lightning; no makeup.",
      shown: null,
    });
  });

  test("locked follows the server clock the sheet was built at", async () => {
    const { read } = await sheetAt();

    expect((await read(THURSDAY)).locked).toBe(false);
    expect((await read(SUNDAY)).locked).toBe(true);
    expect((await read(SUNDAY)).serverNow).toBe(SUNDAY.toISOString());
  });
});

describe("teamName", () => {
  test("names either side of a game by the feed's team id", async () => {
    const { json, michigan } = await sheetAt();
    const { game } = json.games.find((g) => g.game.id === michigan.id)!;

    expect(teamName(game, game.homeTeamId)).toBe(michigan.homeTeam);
    expect(teamName(game, game.awayTeamId)).toBe(michigan.awayTeam);
  });
});
