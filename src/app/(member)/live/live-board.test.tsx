// @vitest-environment jsdom
/**
 * The Live Board's own states, driven from wire shapes rather than a database:
 * the pennant row at twelve members, and each state a Saturday passes through
 * — before the Deadline, before kickoff, in progress, final and Void.
 *
 * Twelve is the point of it. `#33` recorded that the fixture carries five
 * members while the mockups are drawn around twelve, and the engine fixture
 * renders nothing, so nothing in the suite had ever put twelve pennants on one
 * row. Five fit; twelve do not, and the row that holds them is
 * `results/side.pennantRow`. The unit tests there hold the arithmetic; these
 * hold what a member actually sees.
 *
 * Assertions are plain DOM reads, as `picks/pick-flow.test.tsx` explains:
 * `@testing-library/jest-dom` is not a dependency here, and its matchers fail
 * as invalid Chai properties rather than as missing ones.
 *
 * No `fetch` stub and no timers: every fixture below is `complete`, which is
 * `nextPollMs`'s own "nothing left to learn" and leaves the polling effect
 * unarmed. The poll cadence is tested in `week/poll.test.ts`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { GameResult } from "@/lib/results/result";
import type { RevealGame, RevealPick, ScoredMember, WeeklyScore } from "@/lib/results/results";
import type { MemberJson } from "@/lib/slate/json";
import type { WeekStateJson } from "@/lib/week/json";
import { LiveBoard } from "./live-board";

afterEach(cleanup);

const CLEMSON = 10;
const GEORGIA = 11;

function member(id: number): ScoredMember {
  return { id, displayName: `Member ${id}`, avatarId: null };
}

/** The whole family: twelve, as the mockups are drawn. */
const FAMILY: ScoredMember[] = Array.from({ length: 12 }, (_, i) => member(i + 1));
const VIEWER: MemberJson = FAMILY[0];

const FINAL: GameResult = {
  status: "final",
  awayScore: 21,
  homeScore: 34,
  source: "feed",
  live: null,
  shown: { awayScore: 21, homeScore: 34 },
  label: "Final",
  note: null,
  feedFinal: null,
};

const PENDING: GameResult = {
  status: "pending",
  homeScore: null,
  awayScore: null,
  source: null,
  live: null,
  shown: null,
  label: "Scheduled",
  note: null,
  feedFinal: null,
};

const LIVE: GameResult = {
  ...PENDING,
  live: { awayScore: 10, homeScore: 28, period: 3, clock: "08:12" },
  shown: { awayScore: 10, homeScore: 28 },
  label: "In progress",
};

const VOIDED: GameResult = { ...PENDING, status: "void", label: "Void", note: "Postponed to December" };

function game(result: GameResult, picks: RevealPick[] = []): RevealGame {
  return {
    game: {
      id: 1,
      awayTeamId: CLEMSON,
      awayTeam: "Clemson",
      awayRank: null,
      homeTeamId: GEORGIA,
      homeTeam: "Georgia",
      homeRank: null,
      kickoff: "2026-09-12T23:30:00.000Z",
      spread: null,
    },
    result,
    picks,
  };
}

/** Every member in `ids` took `teamId`. */
function picks(teamId: number, ids: number[]): RevealPick[] {
  return ids.map((memberId) => ({ memberId, teamId, outcome: "correct" as const, lock: null }));
}

function score(who: ScoredMember, points: number): WeeklyScore {
  return {
    member: who,
    points,
    correct: points / 10,
    incorrect: 0,
    pending: 0,
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    tiebreakerError: null,
  };
}

/**
 * A Week the Deadline has passed on, every game final. `complete` so the
 * screen's polling effect stays unarmed, as this file's header explains.
 */
function state(over: Partial<WeekStateJson> = {}): WeekStateJson {
  return {
    week: { id: 1, weekNumber: 2, published: true, tiebreakerGameId: null },
    year: 2026,
    deadline: "2026-09-11T23:00:00.000Z",
    serverNow: "2026-09-12T23:45:00.000Z",
    locked: true,
    complete: true,
    members: FAMILY,
    games: [game(FINAL)],
    scores: FAMILY.map((m) => score(m, 30)),
    weeklyWin: null,
    season: { place: 4, of: 12, label: "4th of 12", points: 90 },
    ...over,
  };
}

/**
 * How many pennants the row is showing, counted off the `title` only
 * `PickAvatar` carries. Not by member name: the header chip names the viewer
 * too, and not by `li` either, since the game card is one.
 */
function pennants(): number {
  return document.querySelectorAll("li[title]").length;
}

describe("the pennant row at twelve members", () => {
  test("shows every member when few enough took the side to fit", () => {
    render(
      <LiveBoard initial={state({ games: [game(FINAL, picks(GEORGIA, [1, 2, 3, 4, 5]))] })} viewer={VIEWER} />,
    );

    // Five fit, so nothing is counted and no chip appears.
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    expect(pennants()).toBe(5);
  });

  test("counts the members it cannot fit rather than pushing the score off the row", () => {
    const all = FAMILY.map((m) => m.id);
    render(<LiveBoard initial={state({ games: [game(FINAL, picks(GEORGIA, all))] })} viewer={VIEWER} />);

    // Four pennants and a "+8": twelve members on one side is the case the
    // 390px row has to survive, and the score is what it must not lose.
    expect(screen.getByText("+8")).not.toBeNull();
    expect(pennants()).toBe(4);
    expect(screen.getByText("34")).not.toBeNull();
    expect(screen.getByText("21")).not.toBeNull();
    // Said out loud too, for a member who cannot see the chip.
    expect(screen.getByText("and 8 other members")).not.toBeNull();
  });

  test("keeps the viewer's own pennant on the row when the count would have hidden it", () => {
    // Member 12 picked last, so the cap reaches them first.
    const lastPicker: MemberJson = FAMILY[11];
    const all = FAMILY.map((m) => m.id);
    render(<LiveBoard initial={state({ games: [game(FINAL, picks(GEORGIA, all))] })} viewer={lastPicker} />);

    // "You" is on the row, and still only four pennants beside the chip.
    expect(screen.getByText("You")).not.toBeNull();
    expect(screen.getByText("+8")).not.toBeNull();
  });
});

describe("the states a Saturday passes through", () => {
  test("before the Deadline it shows no picks at all, and says when they lock", () => {
    // The server sends no picks before the Deadline; the screen must not imply
    // any either — not a name, not a count.
    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null, season: null })}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByText(/Picks lock/)).not.toBeNull();
    expect(screen.getByText(/Everyone.s picks show here once they do/)).not.toBeNull();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    expect(screen.queryByText("Member 2")).toBeNull();
    expect(screen.queryByText(/of 12/)).toBeNull();
  });

  test("a game in progress shows its period and clock", () => {
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);

    expect(screen.getByText(/Q3/)).not.toBeNull();
    expect(screen.getByText(/8:12/)).not.toBeNull();
  });

  test("a final game shows its word, and a Void shows why", () => {
    render(<LiveBoard initial={state()} viewer={VIEWER} />);
    expect(screen.getByText("Final")).not.toBeNull();
    cleanup();

    render(<LiveBoard initial={state({ games: [game(VOIDED)] })} viewer={VIEWER} />);
    expect(screen.getByText(/Void/)).not.toBeNull();
    expect(screen.getByText(/Postponed to December/)).not.toBeNull();
  });
});

describe("the viewer's own card", () => {
  test("reads the season, not the week, as mockup 05 draws it", () => {
    // The week scored 30; the season total is 90. Mockup 06 puts the week in
    // this slot on the results screen, and 05 puts the season here.
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    expect(screen.getByText("You · Season")).not.toBeNull();
    expect(screen.getByText("4th of 12")).not.toBeNull();
    expect(screen.getByText("90 pts")).not.toBeNull();
    expect(screen.getByText("3–0 this week")).not.toBeNull();
  });

  test("tells a member who joined after the Deadline that the week does not count", () => {
    // On neither board: no weekly score and no season place.
    const joiner: MemberJson = { id: 99, displayName: "Cousin Em", avatarId: null };
    render(<LiveBoard initial={state({ season: null })} viewer={joiner} />);

    expect(screen.getByText(/joined after this week.s deadline/)).not.toBeNull();
    expect(screen.queryByText("You · Season")).toBeNull();
  });
});
