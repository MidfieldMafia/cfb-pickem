/**
 * The bridge's own tests. `engine.ts` holds one invariant that nothing else
 * can hold for it: the scoring engine sees a Game's *effective* result — Void
 * first, then the Result Override, then the feed — and is never told a game is
 * final when it is not. Every graded screen builds its input here, so a slip
 * would misgrade the Reveal, the week results, the Leaderboard and the Live
 * Board at once, and each of those would show the same wrong number.
 *
 * Plain rows rather than the database fixture: some of these shapes (a row
 * marked final with no score) are what the module defends against, and no
 * write path in the app produces one.
 */
import { describe, expect, test } from "vitest";
import type { Game, Member, Week } from "@/db/schema";
import type { MemberPicks } from "@/lib/picks/picks";
import { scoreWeek } from "@/lib/scoring";
import { toEngineGame, toEngineMember, toEngineWeek } from "./engine";

const KICKOFF = new Date("2026-09-12T16:00:00Z");
const DEADLINE = new Date("2026-09-11T00:00:00Z");
const RULES = { pointsPerCorrectPick: 10, lockMultiplier: 2 };

/** Oklahoma at Michigan, scheduled and unplayed. Tests override only what they are about. */
function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 7,
    weekId: 1,
    cfbdGameId: 401856679,
    homeTeamId: 130,
    homeTeam: "Michigan",
    homeRank: null,
    homeConference: "Big Ten",
    awayTeamId: 201,
    awayTeam: "Oklahoma",
    awayRank: null,
    awayConference: "SEC",
    kickoff: KICKOFF,
    spread: null,
    detail: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    void: false,
    voidNote: null,
    overrideHomeScore: null,
    overrideAwayScore: null,
    overrideNote: null,
    createdAt: KICKOFF,
    updatedAt: KICKOFF,
    ...overrides,
  };
}

function week(overrides: Partial<Week> = {}): Week {
  return {
    id: 1,
    seasonId: 1,
    weekNumber: 2,
    deadline: DEADLINE,
    published: true,
    tiebreakerGameId: 7,
    scoreboardFetchedAt: null,
    createdAt: KICKOFF,
    ...overrides,
  };
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: 1,
    displayName: "Jonah",
    avatarId: null,
    phone: null,
    isCommissioner: true,
    token: "token",
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    active: true,
    welcomedAt: null,
    lastSeenAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

const noPicks: MemberPicks = { memberId: 1, picks: [], lockGameId: null, tiebreakerGuess: null };

describe("a game on its way to the engine", () => {
  test("carries the feed's final score, with the teams as ids", () => {
    expect(toEngineGame(game({ status: "final", homeScore: 27, awayScore: 24 }))).toEqual({
      id: "7",
      homeTeam: "130",
      awayTeam: "201",
      homeScore: 27,
      awayScore: 24,
      status: "final",
      void: false,
    });
  });

  test("a Result Override replaces the feed's score, and the engine is never told which it was", () => {
    const corrected = toEngineGame(
      game({ status: "final", homeScore: 27, awayScore: 24, overrideHomeScore: 27, overrideAwayScore: 30 }),
    );

    expect(corrected).toMatchObject({ status: "final", homeScore: 27, awayScore: 30 });
    // Provenance is a screen's business; scoring reads one number per side.
    expect(corrected).not.toHaveProperty("source");
  });

  test("a Void arrives as void with no score, whatever the feed said", () => {
    const voided = toEngineGame(game({ status: "final", homeScore: 27, awayScore: 24, void: true }));

    expect(voided).toMatchObject({ homeScore: null, awayScore: null, void: true });
    // A void game is settled by the flag, not by the status it happens to carry.
    expect(voided.status).not.toBe("final");
  });

  test("a Void beats a Result Override: a game that will not count cannot be corrected into counting", () => {
    expect(toEngineGame(game({ void: true, overrideHomeScore: 27, overrideAwayScore: 30 }))).toMatchObject({
      homeScore: null,
      awayScore: null,
      void: true,
    });
  });

  test("a row marked final without a score is not final to the engine", () => {
    // The feed can report a game complete before the scores land. Passing it
    // through as final would grade every pick on it incorrect: there is no
    // winner, so nobody picked one.
    const half = toEngineGame(game({ status: "final", homeScore: null, awayScore: 24 }));

    expect(half.status).not.toBe("final");
    expect(half).toMatchObject({ homeScore: null, awayScore: null });
  });

  test("a game in play reaches the engine unfinished, with its running score withheld", () => {
    // Pending is pending: a Live Board colours a pick from the score on the
    // Game row, never from a score the engine was allowed to grade.
    const live = toEngineGame(game({ status: "in_progress", homeScore: 3, awayScore: 0 }));

    expect(live.status).not.toBe("final");
    expect(live).toMatchObject({ homeScore: null, awayScore: null, void: false });
  });
});

describe("a week on its way to the engine", () => {
  test("refuses a week with no deadline, because scoring cannot say who played it", () => {
    expect(() => toEngineWeek(week({ deadline: null }), [game()], [])).toThrow(/deadline/);
  });

  test("flattens every member's picks, lock and guess, and leaves out the ones nobody set", () => {
    const built = toEngineWeek(week(), [game(), game({ id: 8, homeTeamId: 61, awayTeamId: 99 })], [
      { memberId: 1, picks: [{ gameId: 7, teamId: 130, updatedAt: KICKOFF }], lockGameId: 7, tiebreakerGuess: 51 },
      { memberId: 2, picks: [{ gameId: 8, teamId: 99, updatedAt: KICKOFF }], lockGameId: null, tiebreakerGuess: null },
    ]);

    expect(built).toMatchObject({ weekNumber: 2, published: true, tiebreakerGameId: "7" });
    expect(built.deadline).toBe(DEADLINE.toISOString());
    expect(built.games.map((g) => g.id)).toEqual(["7", "8"]);
    expect(built.picks).toEqual([
      { memberId: "1", gameId: "7", team: "130" },
      { memberId: "2", gameId: "8", team: "99" },
    ]);
    // A member who set no Lock and no Guess contributes no row, rather than a null one.
    expect(built.locks).toEqual([{ memberId: "1", gameId: "7" }]);
    expect(built.tiebreakerGuesses).toEqual([{ memberId: "1", guess: 51 }]);
  });

  test("a week with no Tiebreaker Game says so, rather than naming game zero", () => {
    expect(toEngineWeek(week({ tiebreakerGameId: null }), [game()], [noPicks]).tiebreakerGameId).toBeNull();
  });

  test("a member's join date crosses as an instant, so scoring can tell which weeks they played", () => {
    expect(toEngineMember(member({ id: 4, joinedAt: DEADLINE }))).toEqual({
      id: "4",
      joinedAt: DEADLINE.toISOString(),
    });
  });
});

describe("the bridge under the engine", () => {
  const picked: MemberPicks[] = [
    { memberId: 1, picks: [{ gameId: 7, teamId: 130, updatedAt: KICKOFF }], lockGameId: 7, tiebreakerGuess: 51 },
  ];
  const graders = [toEngineMember(member())];

  test("a Result Override regrades the pick it corrects, through the same bridge", () => {
    const feed = game({ status: "final", homeScore: 27, awayScore: 24 });
    const corrected = game({ ...feed, overrideHomeScore: 24, overrideAwayScore: 27 });

    const asFed = scoreWeek(RULES, toEngineWeek(week(), [feed], picked), graders);
    const asCorrected = scoreWeek(RULES, toEngineWeek(week(), [corrected], picked), graders);

    // Michigan picked and Locked: 20 on the feed's score, nothing once the commissioner flips it.
    expect(asFed.scores[0]).toMatchObject({ points: 20, correct: 1, incorrect: 0 });
    expect(asCorrected.scores[0]).toMatchObject({ points: 0, correct: 0, incorrect: 1 });
  });

  test("a Void drops the Lock sitting on it and leaves the week incomplete for nobody", () => {
    const voided = game({ status: "final", homeScore: 27, awayScore: 24, void: true, voidNote: "Postponed" });

    const result = scoreWeek(RULES, toEngineWeek(week(), [voided], picked), graders);

    expect(result.scores[0]).toMatchObject({ points: 0, lock: { gameId: "7", dropped: true } });
    expect(result.scores[0].picks[0].outcome).toBe("void");
    // A Void is settled, not outstanding: the week is done even though the game never finished.
    expect(result.complete).toBe(true);
  });
});
