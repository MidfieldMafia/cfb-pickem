import { describe, expect, test } from "vitest";
import { recordings } from "@/lib/cfbd/recorded";
import type { CfbdGamePlayerStatsSide, CfbdGameTeamStatsSide } from "@/lib/cfbd/types";
import { FAMU_AT_MIAMI, OHIO_STATE_AT_TEXAS, OKLAHOMA_AT_MICHIGAN } from "@/test/week-2";
import { awayShare, shownPosition, toBoxScore, type BoxScore, type Positions } from "./box-score";

const recorded = recordings["2026-week-2"];

/** The recorded roster the way `seasonPositions` keeps it. */
const positions: Positions = Object.fromEntries(
  recorded.roster.flatMap((p) => (shownPosition(p.position) ? [[p.id, shownPosition(p.position)!]] : [])),
);

function sidesOf(gameId: number) {
  return {
    teams: structuredClone(recorded.gameTeamStats.find((g) => g.id === gameId)!.teams),
    players: structuredClone(recorded.gamePlayerStats.find((g) => g.id === gameId)!.teams),
  };
}

function boxOf(gameId: number, at: Positions = positions): BoxScore {
  return toBoxScore(sidesOf(gameId), at)!;
}

const row = (box: BoxScore, key: string) => box.teamStats.find((r) => r.key === key)!;
const leader = (box: BoxScore, key: string) => box.leaders.find((r) => r.key === key)!;

describe("team stats", () => {
  test("the seven rows, in the canvas's order, each side matched by homeAway", () => {
    // Ohio State is away and listed second; Texas is home and listed first.
    const box = boxOf(OHIO_STATE_AT_TEXAS);

    expect(box.teamStats.map((r) => [r.label, r.away.display, r.home.display])).toEqual([
      ["Total yards", "372", "336"],
      ["Turnovers", "1", "2"],
      ["1st downs", "19", "25"],
      ["Penalties", "4-35", "2-12"],
      ["3rd down", "6/14", "9/16"],
      ["4th down", "0/1", "2/3"],
      ["Possession", "28:32", "31:28"],
    ]);
  });

  test("each bar is sized by a number: penalty yards, a conversion rate, possession in seconds", () => {
    const box = boxOf(OHIO_STATE_AT_TEXAS);

    expect(row(box, "totalYards").away.value).toBe(372);
    expect(row(box, "penalties").away.value).toBe(35);
    expect(row(box, "thirdDown").home.value).toBeCloseTo(9 / 16);
    expect(row(box, "possession").away.value).toBe(28 * 60 + 32);
    // Florida A&M never went for it on 4th: no attempts is a rate of 0, not NaN.
    expect(row(boxOf(FAMU_AT_MIAMI), "fourthDown").away).toEqual({ display: "0/0", value: 0 });
  });

  test("a category CFBD left out because it came to zero reads as zero, whatever the order of the rest", () => {
    const sides = sidesOf(OHIO_STATE_AT_TEXAS);
    const texas = sides.teams.find((s) => s.homeAway === "home")!;
    texas.stats = texas.stats
      .filter((s) => !["turnovers", "fourthDownEff", "totalPenaltiesYards", "possessionTime"].includes(s.category))
      .reverse();

    const box = toBoxScore(sides, positions)!;

    expect(row(box, "turnovers").home).toEqual({ display: "0", value: 0 });
    expect(row(box, "fourthDown").home).toEqual({ display: "0/0", value: 0 });
    expect(row(box, "penalties").home).toEqual({ display: "0-0", value: 0 });
    expect(row(box, "possession").home).toEqual({ display: "0:00", value: 0 });
    expect(row(box, "totalYards").home.display).toBe("336");
  });

  test("a response missing either side, from either endpoint, is not a box score yet", () => {
    const noHomeTeam = sidesOf(OHIO_STATE_AT_TEXAS);
    noHomeTeam.teams = noHomeTeam.teams.filter((s: CfbdGameTeamStatsSide) => s.homeAway !== "home");
    const noAwayPlayers = sidesOf(OHIO_STATE_AT_TEXAS);
    noAwayPlayers.players = noAwayPlayers.players.filter((s: CfbdGamePlayerStatsSide) => s.homeAway !== "away");

    expect(toBoxScore(noHomeTeam, positions)).toBeNull();
    expect(toBoxScore(noAwayPlayers, positions)).toBeNull();
  });
});

describe("game leaders", () => {
  test("five categories, each with a name, a position, the figure and its detail line", () => {
    const box = boxOf(OHIO_STATE_AT_TEXAS);

    expect(box.leaders.map((r) => [r.label, r.away && [r.away.name, r.away.position, r.away.value, r.away.detail]])).toEqual([
      ["Passing yards", ["Julian Sayin", "QB", "278", "17/32, 1 TD, 1 INT"]],
      ["Rushing yards", ["Bo Jackson", "RB", "74", "19 car"]],
      ["Receiving yards", ["Jeremiah Smith", "WR", "164", "8 rec, 1 TD"]],
      ["Sacks", ["Riley Pettijohn", "LB", "1", null]],
      ["Tackles", ["Earl Little II", "S", "11", "6 solo"]],
    ]);
    expect(leader(box, "passing").home).toMatchObject({ playerId: "4870906", name: "Arch Manning", detail: "23/37, 1 TD, 1 INT" });
  });

  test("a zero is left off the detail line: no TDs, no INTs", () => {
    const box = boxOf(OKLAHOMA_AT_MICHIGAN);

    expect(leader(box, "passing").home?.detail).toBe("9/17");
    expect(leader(box, "rushing").away?.detail).toBe("13 car");
    expect(leader(box, "receiving").away?.detail).toBe("6 rec");
  });

  describe("ties", () => {
    test("go to the higher secondary figure: for sacks, tackles for loss before total tackles", () => {
      // Kenyatta Jackson and Riley Pettijohn have a sack each; Pettijohn has 1.5 TFL to 1.
      expect(leader(boxOf(OHIO_STATE_AT_TEXAS), "sacks").away?.name).toBe("Riley Pettijohn");
      // Reggie Powers III (2 TFL, 4 tackles) over Owen Heinecke (1 TFL, 10 tackles).
      expect(leader(boxOf(OKLAHOMA_AT_MICHIGAN), "sacks").away?.name).toBe("Reggie Powers III");
      // Lightfoot and Scroggins level on sacks and TFL; Lightfoot has 2 tackles to 1.
      expect(leader(boxOf(FAMU_AT_MIAMI), "sacks").home?.name).toBe("Marquise Lightfoot");
    });

    test("go to TDs first where there are any", () => {
      const sides = sidesOf(OHIO_STATE_AT_TEXAS);
      const rushing = sides.players.find((s) => s.homeAway === "away")!.categories.find((c) => c.name === "rushing")!;
      // Give Ja'Kobi Jackson Bo Jackson's 74 yards and one TD.
      for (const t of rushing.types) {
        const jakobi = t.athletes.find((a) => a.name === "Ja'Kobi Jackson")!;
        if (t.name === "YDS") jakobi.stat = "74";
        if (t.name === "TD") jakobi.stat = "1";
      }

      expect(leader(toBoxScore(sides, positions)!, "rushing").away).toMatchObject({
        name: "Ja'Kobi Jackson",
        detail: expect.stringMatching(/, 1 TD$/),
      });
    });

    test("level on every figure, go to the name that sorts first", () => {
      // Chase Gillespie and Corey Petty: 3 catches, 20 yards, no TD each.
      expect(leader(boxOf(FAMU_AT_MIAMI), "receiving").away).toMatchObject({ name: "Chase Gillespie", detail: "3 rec" });
    });
  });

  test("a side with no sacks has nobody, not a player with 0", () => {
    const box = boxOf(FAMU_AT_MIAMI);

    expect(leader(box, "sacks").away).toBeNull();
    expect(leader(box, "sacks").home).not.toBeNull();
  });

  test("the \" Team\" pseudo-player never leads, however big its figure", () => {
    const sides = sidesOf(OKLAHOMA_AT_MICHIGAN);
    const defensive = sides.players.find((s) => s.homeAway === "home")!.categories.find((c) => c.name === "defensive")!;
    for (const t of defensive.types) t.athletes.push({ id: "-130", name: " Team", stat: t.name === "TOT" ? "99" : "0" });

    expect(leader(toBoxScore(sides, positions)!, "tackles").home?.name).toBe("Troy Bowles");
  });

  test("a leader the roster has no position for shows none, and a \"?\" is never shown", () => {
    const withoutSayin = { ...positions };
    delete withoutSayin["5079712"];

    expect(leader(boxOf(OHIO_STATE_AT_TEXAS, withoutSayin), "passing").away).toMatchObject({
      name: "Julian Sayin",
      position: null,
    });
    expect(shownPosition("?")).toBeNull();
    expect(shownPosition(null)).toBeNull();
    expect(shownPosition(" QB ")).toBe("QB");
    // Two players in the recording have a null position, and neither is kept.
    expect(recorded.roster.filter((p) => p.position === null)).toHaveLength(2);
    expect(Object.values(positions)).not.toContain(null);
  });
});

describe("the split bar", () => {
  const side = (value: number) => ({ display: String(value), value });
  const split = (away: number, home: number) => awayShare({ key: "totalYards", label: "Total yards", away: side(away), home: side(home) });

  test("away's share of the two values, as the canvas sizes it", () => {
    expect(split(356, 421)).toBeCloseTo(0.458, 3);
    expect(split(2, 0)).toBe(1);
    expect(split(0, 1)).toBe(0);
  });

  test("two zeroes split evenly rather than dividing by nothing", () => {
    expect(split(0, 0)).toBe(0.5);
  });

  test("the recorded rows all land between 0 and 1", () => {
    for (const r of boxOf(OHIO_STATE_AT_TEXAS).teamStats) {
      const share = awayShare(r);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});
