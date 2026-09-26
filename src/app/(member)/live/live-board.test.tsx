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
 * No `fetch` stub and no timers outside the freshness-line, live-sheet and
 * final-sheet blocks. Most fixtures are `complete`, which is `nextPollMs`'s own "nothing
 * left to learn" and leaves the polling effect unarmed; the rest end before
 * their first poll is due, and only a live or final game's sheet asks for its plays.
 * The poll cadence is tested in `week/poll.test.ts`.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FinalStats } from "@/lib/results/box-score";
import type { GameResult } from "@/lib/results/result";
import type { RevealPick, ScoredMember, WeeklyScore } from "@/lib/results/results";
import type { MemberJson } from "@/lib/slate/json";
import type { LiveGameJson, WeekStateJson } from "@/lib/week/json";
import { kickoffDay, kickoffLine, kickoffTime } from "@/lib/week/kickoff";
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
  live: { awayScore: 10, homeScore: 28, period: 3, clock: "08:12", possession: null, lastPlay: null, situation: null, feed: null },
  shown: { awayScore: 10, homeScore: 28 },
  label: "In progress",
};

const VOIDED: GameResult = { ...PENDING, status: "void", label: "Void", note: "Postponed to December" };

function game(result: GameResult, picks: RevealPick[] = []): LiveGameJson {
  return {
    detail: null,
    ownPick: null,
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
    expect(screen.queryByRole("link", { name: /on the Leaderboard/ })).toBeNull();
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
  test("before the Deadline, one card holds your own pick and when everyone's show, in place of the picks", () => {
    const mine = { ...game(PENDING), ownPick: { teamId: GEORGIA, lock: "counts" as const } };
    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [mine], scores: null, members: [] })}
        viewer={VIEWER}
      />,
    );

    openGame();
    expect(screen.getByText("Your pick")).not.toBeNull();
    expect(screen.getByLabelText("Lock of the Week")).not.toBeNull();
    expect(screen.getByText(/Everyone.s picks show at the deadline/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Change your pick" }).getAttribute("href")).toBe("/picks");
    expect(screen.queryByText(/Picks aren.t visible yet|of 0|Nobody picked/)).toBeNull();
    // The one padlock here is on your own pick, inside the card that replaced the note.
    expect(screen.queryByText(/A padlock marks/)).toBeNull();
  });

  test("before the Deadline with no pick yet, the link asks for one", () => {
    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null, members: [] })}
        viewer={VIEWER}
      />,
    );

    openGame();
    expect(screen.queryByText("Your pick")).toBeNull();
    expect(screen.getByRole("link", { name: "Make your pick" })).not.toBeNull();
  });

  test("before kickoff, the header is the date and time, and Game information lists the detail", () => {
    const detail = {
      kickoff: "2026-09-12T23:30:00.000Z",
      venue: "Sanford Stadium",
      city: "Athens, GA",
      tv: "ABC",
      homeWp: 0.7,
      spread: "Georgia -6.5",
      weather: { temperature: 68, precipitation: 40, icon: "cloud-rain" as const, wind: 9 },
      home: { rank: 2, record: "3–0", pointsFor: null, pointsAgainst: null, yardsFor: null, yardsAgainst: null },
      away: { rank: 4, record: "4–0", pointsFor: null, pointsAgainst: null, yardsFor: null, yardsAgainst: null },
    };
    const scheduled = { ...game(PENDING, picks(GEORGIA, [2, 3], "pending")), detail };
    scheduled.game = { ...scheduled.game, spread: "Georgia -6.5" };
    render(<LiveBoard initial={state({ complete: false, games: [scheduled], serverNow: "2026-09-12T15:00:00.000Z" })} viewer={VIEWER} />);

    openGame();
    // In the test machine's own zone, as a phone would after hydration.
    const kickoff = new Date(detail.kickoff);
    expect(screen.getByText(kickoffDay(kickoff, new Date("2026-09-12T15:00:00.000Z")))).not.toBeNull();
    expect(screen.getByText(kickoffTime(kickoff))).not.toBeNull();
    expect(screen.getByText("4–0")).not.toBeNull();
    expect(screen.getByText("3–0")).not.toBeNull();
    expect(screen.getByText("Game information")).not.toBeNull();
    expect(screen.getByText(kickoffLine(kickoff))).not.toBeNull();
    expect(screen.getByText("Sanford Stadium")).not.toBeNull();
    expect(screen.getByText("Athens, GA")).not.toBeNull();
    expect(screen.getByText("68°")).not.toBeNull();
    expect(screen.getAllByText("ABC")).toHaveLength(2);
    expect(screen.getByText("Georgia −6.5")).not.toBeNull();
    // After the Deadline the picks show, with no Leading or Trailing before a snap, and no padlock to explain.
    expect(screen.getByText("2 of 12")).not.toBeNull();
    expect(screen.queryByText(/Leading|Trailing/)).toBeNull();
    expect(screen.queryByText(/A padlock marks/)).toBeNull();
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
    expect(screen.getByText(/A padlock marks/)).not.toBeNull();
  });

  test("a void game's sheet asks for nothing", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<LiveBoard initial={state({ games: [game(VOIDED)] })} viewer={VIEWER} />);

    openGame();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("the final sheet (#309)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const value = (display: string, v: number) => ({ display, value: v });
  const STATS: FinalStats = {
    colors: { away: "#F56600", home: "#BA0C2F" },
    teamStats: [
      { key: "totalYards", label: "Total yards", away: value("356", 356), home: value("421", 421) },
      { key: "turnovers", label: "Turnovers", away: value("2", 2), home: value("0", 0) },
      { key: "firstDowns", label: "1st downs", away: value("19", 19), home: value("24", 24) },
      { key: "penalties", label: "Penalties", away: value("6-55", 55), home: value("4-30", 30) },
      { key: "thirdDown", label: "3rd down", away: value("4/12", 4 / 12), home: value("7/13", 7 / 13) },
      { key: "fourthDown", label: "4th down", away: value("0/0", 0), home: value("0/0", 0) },
      { key: "possession", label: "Possession", away: value("27:10", 1630), home: value("32:50", 1970) },
    ],
    leaders: [
      {
        key: "passing",
        label: "Passing yards",
        away: { playerId: "1", name: "Cade Klubnik", position: "QB", value: "248", detail: "22/34, 1 TD" },
        home: { playerId: "2", name: "Gunner Stockton", position: null, value: "262", detail: "24/33, 2 TD" },
      },
      { key: "rushing", label: "Rushing yards", away: null, home: null },
      { key: "receiving", label: "Receiving yards", away: null, home: null },
      {
        key: "sacks",
        label: "Sacks",
        away: null,
        home: { playerId: "3", name: "Jalon Walker", position: "LB", value: "1.5", detail: null },
      },
      { key: "tackles", label: "Tackles", away: null, home: null },
    ],
  };

  /** The plays endpoint for a final game: no drives it matters for, and `final` as given. */
  function serving(final: FinalStats | null) {
    const fetch = vi.fn(async (path: string) =>
      path.endsWith("/plays")
        ? Response.json({ gameId: 1, fetchedAt: null, drives: [], descriptions: [], recap: null, final })
        : new Response(null, { status: 304 }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  test("the header reads Final, and Team stats and Game leaders sit under the picks, with no Recent plays", async () => {
    serving(STATS);
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    openGame();
    expect(screen.getAllByText("Final").length).toBeGreaterThan(1);
    expect(screen.getAllByText("34")).toHaveLength(2);
    expect(await screen.findByText("Team stats")).not.toBeNull();
    expect(screen.queryByText("Recent plays")).toBeNull();

    const bar = screen.getByRole("img", { name: "Total yards: Clemson 356, Georgia 421" });
    const [away, home] = Array.from(bar.children) as HTMLElement[];
    expect(away.style.width).toBe("45.8%");
    expect(away.style.background).toBe("rgb(245, 102, 0)");
    expect(home.style.background).toBe("rgb(186, 12, 47)");
    // No 4th-down tries on either side splits the bar evenly.
    expect((screen.getByRole("img", { name: /^4th down/ }).children[0] as HTMLElement).style.width).toBe("50%");
    expect(screen.getAllByRole("img", { name: /: Clemson .*, Georgia / })).toHaveLength(7);
  });

  test("a leader shows name, position and detail; a missing position is left off, and an empty side says so", async () => {
    serving(STATS);
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    openGame();
    expect(await screen.findByText("Game leaders")).not.toBeNull();
    expect(screen.getByText("Cade Klubnik").textContent).toBe("Cade Klubnik QB");
    expect(screen.getByText("22/34, 1 TD")).not.toBeNull();
    expect(screen.getByText("Gunner Stockton").textContent).toBe("Gunner Stockton");
    expect(screen.getByText("Jalon Walker").textContent).toBe("Jalon Walker LB");
    expect(screen.getByText("1.5")).not.toBeNull();
    expect(screen.getByText("No sacks")).not.toBeNull();
    expect(screen.queryByRole("img", { name: /Klubnik|Stockton/ })).toBeNull();
  });

  test("before the stats are published, one line says they are coming, and they show when they arrive", async () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });
    serving(null);
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    openGame();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getByText("Stats arrive shortly after the final.")).not.toBeNull();
    expect(screen.queryByText("Team stats")).toBeNull();

    // The next poll finds them published.
    const published = serving(STATS);
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(screen.getByText("Team stats")).not.toBeNull();
    expect(screen.queryByText(/Stats arrive/)).toBeNull();

    // A box score never changes once stored, so the sheet stops asking.
    await act(async () => void (await vi.advanceTimersByTimeAsync(90_000)));
    expect(published.mock.calls.filter(([path]) => String(path).endsWith("/plays"))).toHaveLength(1);
  });
});

describe("the live sheet", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A drive's worth of the feed, as the plays endpoint answers it. */
  function playsJson(fetchedAt: string | null = "2026-09-12T23:45:00.000Z") {
    const play = (id: string, clock: string, text: string, home: number, away: number) => ({
      id,
      homeScore: home,
      awayScore: away,
      period: 3,
      clock,
      wallClock: "2026-09-12T23:44:00.000Z",
      teamId: GEORGIA,
      team: "Georgia",
      down: 1,
      distance: 10,
      yardsToGoal: 20,
      yardsGained: 0,
      playTypeId: 1,
      playType: "Rush",
      epa: null,
      garbageTime: false,
      success: false,
      rushPass: "rush",
      downType: "standard",
      playText: text,
    });
    return {
      gameId: 1,
      fetchedAt,
      drives:
        fetchedAt === null
          ? []
          : [
              {
                id: "d1",
                offenseId: GEORGIA,
                offense: "Georgia",
                defenseId: CLEMSON,
                defense: "Clemson",
                playCount: 2,
                yards: 20,
                startPeriod: 3,
                startClock: "9:00",
                startYardsToGoal: 20,
                endPeriod: 3,
                endClock: "8:12",
                endYardsToGoal: 0,
                duration: "0:48",
                scoringOpportunity: true,
                result: "",
                pointsGained: 7,
                plays: [
                  play("p1", "9:00", "Timeout Clemson, clock 09:00", 21, 10),
                  play("p2", "08:12", "C.Back run for 20 yds for a TOUCHDOWN (kick attempt good)", 28, 10),
                ],
              },
            ],
      descriptions: [
        { id: "p1", start: null, side: null, segments: [], rest: { spot: null, side: null, down: null, distance: null } },
        {
          id: "p2",
          start: 80,
          side: "home",
          segments: [{ kind: "flash", label: "Touchdown" }],
          rest: { spot: null, side: "home", down: null, distance: null },
        },
      ],
      recap: null,
      final: null,
    };
  }

  /** Answers the plays endpoint with `plays` and the week state with `weekState`, or a 304 without one. */
  function serving(plays: unknown, weekState?: () => WeekStateJson) {
    const fetch = vi.fn(async (path: string) => {
      if (path.endsWith("/plays")) return Response.json(plays);
      return weekState ? Response.json(weekState()) : new Response(null, { status: 304 });
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  test("shows the score with the Live badge, and this drive's plays newest first with the score tagged", async () => {
    serving(playsJson());
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);

    openGame();
    expect(await screen.findByText("Recent plays")).not.toBeNull();
    const rows = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Timeout") || li.textContent?.includes("TOUCHDOWN"));
    expect(rows[0].textContent).toContain("TOUCHDOWN");
    expect(screen.getByText("Touchdown")).not.toBeNull();
    // No abbreviation in the feed's words yet, so the teams go by name.
    expect(screen.getByText("Clemson 10–28 Georgia")).not.toBeNull();
    expect(screen.getByText("8:12", { selector: "li span" })).not.toBeNull();
  });

  test("polls the plays every 30 s while open, and stops when the sheet closes", async () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });
    const fetch = serving(playsJson());
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);
    const playCalls = () => fetch.mock.calls.filter(([path]) => String(path).endsWith("/plays")).length;

    openGame();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(playCalls()).toBe(1);

    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(playCalls()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(90_000)));
    expect(playCalls()).toBe(2);
  });

  test("a hidden tab stops asking, and asks again the moment it is back", async () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });
    const fetch = serving(playsJson());
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);
    const playCalls = () => fetch.mock.calls.filter(([path]) => String(path).endsWith("/plays")).length;
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);

    openGame();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(playCalls()).toBe(1);

    // Its next turn finds the tab hidden and asks nothing, then or after.
    visibility = "hidden";
    await act(async () => void (await vi.advanceTimersByTimeAsync(90_000)));
    expect(playCalls()).toBe(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(playCalls()).toBe(2);
  });

  test("a game the feed does not carry has no Recent plays at all", async () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });
    serving(playsJson(null));
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);

    openGame();
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.queryByText("Recent plays")).toBeNull();
    expect(screen.queryByText(/Plays show up here/)).toBeNull();
  });

  test("a score change counts up a point at a time", async () => {
    vi.useFakeTimers({ now: new Date(state().serverNow) });
    const scored: GameResult = { ...LIVE, shown: { awayScore: 10, homeScore: 31 }, live: { ...LIVE.live!, homeScore: 31 } };
    serving(playsJson(), () => state({ complete: false, games: [game(scored)] }));
    render(<LiveBoard initial={state({ complete: false, games: [game(LIVE)] })} viewer={VIEWER} />);

    openGame();
    const home = () => screen.getByText(/^(28|29|30|31)$/, { selector: "p span" });
    expect(home().textContent).toBe("28");

    // The week state's next poll brings a field goal.
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(home().textContent).toBe("28");
    expect(home().className).toContain("text-live");

    await act(async () => void (await vi.advanceTimersByTimeAsync(145)));
    expect(home().textContent).toBe("29");

    // Each point is its own render, so each gets its own act.
    await act(async () => void (await vi.advanceTimersByTimeAsync(145)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(145)));
    expect(home().textContent).toBe("31");
    expect(home().className).not.toContain("text-live");
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

  test("opens that Week's standings on the Leaderboard (#245)", () => {
    render(<LiveBoard initial={state({ scores: [score(FAMILY[0], 30), ...FAMILY.slice(1).map((m) => score(m, 10))] })} viewer={VIEWER} />);

    const link = screen.getByRole("link", { name: /Open Week 2 on the Leaderboard/ });
    expect(link.getAttribute("href")).toBe("/leaderboard?week=2");
    expect(link.getAttribute("aria-label")).toBe("You are 1st of 12 in Week 2 with 30 pts. Open Week 2 on the Leaderboard");
  });

  test("tells a member who joined after the Deadline that the week does not count", () => {
    // On neither board: no weekly score at all.
    const joiner: MemberJson = { id: 99, displayName: "Cousin Em", avatarId: null };
    render(<LiveBoard initial={state()} viewer={joiner} />);

    expect(screen.getByText(/joined after this week.s deadline/)).not.toBeNull();
    expect(screen.queryByText(/You · Week/)).toBeNull();
    expect(screen.queryByRole("link", { name: /on the Leaderboard/ })).toBeNull();
  });
});

describe("the freshness line (#95)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  test("holds still between ticks, even when a render outlasts a millisecond", () => {
    // Fake timers freeze the clock, which hides this; a slow render does not.
    // A clock that moves on every read is the slow render's view of it.
    let now = new Date(state().serverNow).getTime();
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1));
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(
      <LiveBoard
        initial={state({ locked: false, complete: false, games: [game(PENDING)], scores: null })}
        viewer={VIEWER}
      />,
    );

    expect(screen.getByText(/Updated/)).not.toBeNull();
  });

  test("says nothing once the Week is complete — there is nothing left to go stale", () => {
    render(<LiveBoard initial={state()} viewer={VIEWER} />);

    expect(screen.queryByText(/Updated/)).toBeNull();
  });
});
