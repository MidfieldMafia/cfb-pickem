// @vitest-environment jsdom
/**
 * The Live Board's own states, driven from wire shapes rather than a database:
 * the picker sheet at twelve members, and each state a Saturday passes through
 * — before the Deadline, before kickoff, in progress, final and Void.
 *
 * Twelve is the point of it. The board itself only ever shows the viewer's own
 * pick on the row now — the full picker list lives in the sheet a tap opens,
 * so this is where twelve members on one side actually gets exercised, and
 * there is no cap to hit: the sheet wraps.
 *
 * Assertions are plain DOM reads, as `picks/pick-flow.test.tsx` explains:
 * `@testing-library/jest-dom` is not a dependency here, and its matchers fail
 * as invalid Chai properties rather than as missing ones.
 *
 * No `fetch` stub and no timers outside the freshness-line block: every
 * fixture below is `complete`, which is `nextPollMs`'s own "nothing left to
 * learn" and leaves the polling effect unarmed. The poll cadence is tested in
 * `week/poll.test.ts`.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
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

/** The whole family: twelve. */
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
  live: { awayScore: 10, homeScore: 28, period: 3, clock: "08:12", possession: null, lastPlay: null, situation: null },
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

/** Every member in `ids` took `teamId`, graded as `outcome` (a final game's word by default). */
function picks(teamId: number, ids: number[], outcome: RevealPick["outcome"] = "correct"): RevealPick[] {
  const points = outcome === "correct" ? 10 : 0;
  return ids.map((memberId) => ({ memberId, teamId, outcome, lock: null, points }));
}

function score(who: ScoredMember, points: number): WeeklyScore {
  return {
    member: who,
    played: true,
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
    season: null,
    ...over,
  };
}

/** Opens the one game on the board and returns the sheet's container (the whole document; vaul portals to `document.body`). */
function openGame() {
  fireEvent.click(screen.getByRole("button", { name: /Clemson at Georgia, details/ }));
}

describe("the states a Saturday passes through", () => {
  test("before the Deadline it shows no picks at all, and says when they lock", () => {
    // The server sends no picks before the Deadline; the screen must not imply
    // any either — not a name, not a rank.
    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null })}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByText(/Picks lock/)).not.toBeNull();
    expect(screen.getByText(/Everyone.s picks show here once they do/)).not.toBeNull();
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

  test("shows the spread on both sides before kickoff, from a plain ASCII hyphen line", () => {
    // `spreadText` (cfbd/details.ts) writes "Georgia -6.5" with a plain
    // hyphen, not the "−" a first draft of this parser assumed.
    const scheduled = { ...game(PENDING), game: { ...game(PENDING).game, spread: "Georgia -6.5" } };
    render(<LiveBoard initial={state({ complete: false, games: [scheduled] })} viewer={VIEWER} />);

    expect(screen.getByText("-6.5")).not.toBeNull();
    expect(screen.getByText("+6.5")).not.toBeNull();
  });

  test("orders live games first, then what hasn't kicked off, then finals and voids", () => {
    const live = { ...game(LIVE), game: { ...game(LIVE).game, id: 1, awayTeam: "Live Away", homeTeam: "Live Home" } };
    const scheduled = { ...game(PENDING), game: { ...game(PENDING).game, id: 2, awayTeam: "Sched Away", homeTeam: "Sched Home" } };
    const final = { ...game(FINAL), game: { ...game(FINAL).game, id: 3, awayTeam: "Final Away", homeTeam: "Final Home" } };
    const voided = { ...game(VOIDED), game: { ...game(VOIDED).game, id: 4, awayTeam: "Void Away", homeTeam: "Void Home" } };

    render(<LiveBoard initial={state({ games: [voided, final, scheduled, live], complete: false })} viewer={VIEWER} />);

    const order = screen.getAllByRole("button", { name: /details/ }).map((el) => el.getAttribute("aria-label"));
    expect(order).toEqual([
      "Live Away at Live Home, details",
      "Sched Away at Sched Home, details",
      "Final Away at Final Home, details",
      "Void Away at Void Home, details",
    ]);
  });
});

describe("a pick's mark only grades once the game is final (#98)", () => {
  test("a pick on a game still going shows a hollow mark, not a graded one", () => {
    render(
      <LiveBoard
        initial={state({ complete: false, games: [game(LIVE, picks(GEORGIA, [VIEWER.id], "pending"))] })}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByTitle("Your pick")).not.toBeNull();
    expect(screen.queryByTitle(/won|lost/)).toBeNull();
  });

  test("a correct pick on a final game shows it won", () => {
    render(<LiveBoard initial={state({ games: [game(FINAL, picks(GEORGIA, [VIEWER.id], "correct"))] })} viewer={VIEWER} />);
    expect(screen.getByTitle("Your pick won")).not.toBeNull();
    expect(screen.getByText("+10")).not.toBeNull();
  });

  test("an incorrect pick on a final game shows it lost, and earns nothing", () => {
    render(<LiveBoard initial={state({ games: [game(FINAL, picks(CLEMSON, [VIEWER.id], "incorrect"))] })} viewer={VIEWER} />);
    expect(screen.getByTitle("Your pick lost")).not.toBeNull();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});

describe("the sheet a tap opens", () => {
  test("before the Deadline, says picks aren't visible yet rather than 0 of 0", () => {
    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null, members: [] })}
        viewer={VIEWER}
      />,
    );

    openGame();
    expect(screen.getAllByText(/Picks aren.t visible yet/)).toHaveLength(2);
    expect(screen.queryByText(/of 0/)).toBeNull();
  });


  test("lists every member who took a side, with no cap — twelve fit by wrapping, not by counting", () => {
    const all = FAMILY.map((m) => m.id);
    render(<LiveBoard initial={state({ games: [game(FINAL, picks(GEORGIA, all))] })} viewer={VIEWER} />);

    openGame();

    // Every member is named once the sheet is open, twelfth included — the
    // old on-row cap ("+8") does not exist here to have hidden anyone.
    expect(screen.getByText("You")).not.toBeNull();
    for (let i = 2; i <= 12; i++) expect(screen.getByText(`Member ${i}`)).not.toBeNull();
    expect(screen.queryByText(/^\+\d+ other/)).toBeNull();
  });

  test("shows a Lock of the Week, and a Dropped Lock once its game is void", () => {
    const lockPick: RevealPick = { memberId: FAMILY[1].id, teamId: GEORGIA, outcome: "void", lock: "dropped", points: 0 };
    render(<LiveBoard initial={state({ games: [game(VOIDED, [lockPick])] })} viewer={VIEWER} />);

    openGame();
    expect(screen.getByLabelText(/dropped/)).not.toBeNull();
  });
});

describe("the viewer's own rank", () => {
  test("reads the week, not the season — the stake on a Saturday is this week", () => {
    render(<LiveBoard initial={state({ scores: [score(FAMILY[0], 30), ...FAMILY.slice(1).map((m) => score(m, 10))] })} viewer={VIEWER} />);

    expect(screen.getByText(/You · Week 2/)).not.toBeNull();
    expect(screen.getByText("1st of 12")).not.toBeNull();
    expect(screen.getByText("30 pts")).not.toBeNull();
    expect(screen.getByText("3–0 so far")).not.toBeNull();
  });

  test("tells a member who joined after the Deadline that the week does not count", () => {
    // On neither board: no weekly score at all.
    const joiner: MemberJson = { id: 99, displayName: "Cousin Em", avatarId: null };
    render(<LiveBoard initial={state()} viewer={joiner} />);

    expect(screen.getByText(/joined after this week.s deadline/)).not.toBeNull();
    expect(screen.queryByText(/You · Week/)).toBeNull();
  });
});

describe("the freshness line (#95)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("says how long ago the scores were confirmed, and when the next check is due", () => {
    // The phone's clock agrees with the server's, so "just now" is exact
    // rather than a coincidence of real wall-clock time.
    vi.useFakeTimers({ now: new Date(state().serverNow) });

    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null })}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByText(/Updated just now/)).not.toBeNull();
    // Idle cadence: nothing is under way, so the next check is five minutes out.
    expect(screen.getByText(/next check in 5m/)).not.toBeNull();
  });

  test("ticks forward on its own rather than freezing at the render that set it", () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });

    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);
    expect(screen.getByText(/Updated just now/)).not.toBeNull();

    act(() => void vi.advanceTimersByTime(12_000));

    expect(screen.getByText(/Updated 12s ago/)).not.toBeNull();
    // Live cadence: a game is under way, so the next check is thirty seconds out.
    expect(screen.getByText(/next check in 18s/)).not.toBeNull();
  });

  test("says nothing once the Week is complete — there is nothing left to go stale", () => {
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    expect(screen.queryByText(/Updated/)).toBeNull();
  });
});
