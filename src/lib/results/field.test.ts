import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLivePlay } from "@/lib/cfbd/types";
import { abbreviations, ballSide, describePlays, type PlayDescription } from "./field";

// Liberty at Coastal Carolina: Liberty (LIB) is away and attacks towards 100, Coastal (CCU) home and towards 0.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335 };
const PLAYS = LIBERTY_AT_COASTAL_FINAL.drives.flatMap((drive) => drive.plays);
const DESCRIBED = describePlays(PLAYS, TEAMS);

/** A play's description in the whole final game, by the last digits of its id. */
function play(suffix: string): PlayDescription {
  const found = DESCRIBED.find((description) => description.id === `401869941${suffix}`);
  if (!found) throw new Error(`no play …${suffix}`);
  return found;
}

/** The plays up to and including one, as the feed served them while it was the newest. */
function upTo(suffix: string): CfbdLivePlay[] {
  return PLAYS.slice(0, PLAYS.findIndex((p) => p.id === `401869941${suffix}`) + 1);
}

describe("the whole final game", () => {
  test("every play gets a description, in the feed's order", () => {
    expect(DESCRIBED.map((d) => d.id)).toEqual(PLAYS.map((p) => p.id));
    expect(DESCRIBED).toHaveLength(181);
  });

  test("the team abbreviations are placed from the plays themselves", () => {
    const sides = abbreviations(PLAYS, (id) => (id === 324 ? "home" : id === 2335 ? "away" : null));
    expect(Object.fromEntries(sides)).toEqual({ CCU: "home", LIB: "away" });
  });

  test("every play but a marker rests where the next real play starts", () => {
    // The feed's own end spots, where the words agree with them: the parser is checked against the numbers it doesn't use.
    const misses = DESCRIBED.filter((d, i) => {
      const next = PLAYS.slice(i + 1).find((p) => !/Timeout|End/.test(p.playType));
      if (!next || /Timeout|End/.test(PLAYS[i].playType) || /Kickoff/.test(next.playType)) return false;
      const side = next.teamId === 324 ? "home" : "away";
      const start = side === "away" ? 100 - next.yardsToGoal! : next.yardsToGoal!;
      return d.rest.spot !== start || d.rest.side !== side;
    });
    // …148, a penalty the feed later re-spotted in the text but not in the numbers (CCU16 against CCU14).
    expect(misses.map((d) => d.id)).toEqual(["401869941640"]);
  });
});

describe("each shape", () => {
  test("a run is a ground line", () => {
    // "rush middle for 20 yards gain to the LIB39": Coastal from its own 41.
    expect(play("21")).toEqual({
      id: "40186994121",
      start: 59,
      side: "home",
      segments: [{ kind: "ground", from: 59, to: 39 }],
      rest: { spot: 39, side: "home", down: 1, distance: 10 },
    });
  });

  test("a sack is a ground line backwards", () => {
    expect(play("54").segments).toEqual([{ kind: "ground", from: 92, to: 89 }]);
  });

  test("a completion arcs to the catch, then runs the yards after it", () => {
    // "caught at LIB30, for 10 yards to the LIB32"
    expect(play("38").segments).toEqual([
      { kind: "arc", from: 22, to: 30 },
      { kind: "ground", from: 30, to: 32 },
    ]);
  });

  test("an incompletion arcs to where it was thrown, marks the X, and goes back to the line", () => {
    // "thrown to LIB48"
    expect(play("66")).toMatchObject({
      segments: [
        { kind: "arc", from: 75, to: 48 },
        { kind: "miss", at: 48 },
        { kind: "jump", to: 75 },
      ],
      rest: { spot: 75, side: "home", down: 2, distance: 10 },
    });
  });

  test("a spike, with no spot, is the schematic twelve-yard throw", () => {
    expect(play("395").segments).toEqual([
      { kind: "arc", from: 39, to: 27 },
      { kind: "miss", at: 27 },
      { kind: "jump", to: 39 },
    ]);
  });

  test("a kickoff with a return arcs to the landing, swaps, and runs the return", () => {
    // "kickoff 65 yards to the CCU00 #14 C.Hinton return 51 yards to the LIB49"
    expect(play("161")).toMatchObject({
      start: 35,
      side: "away",
      segments: [
        { kind: "arc", from: 35, to: 100 },
        { kind: "possession", side: "home" },
        { kind: "ground", from: 100, to: 49 },
      ],
      rest: { spot: 49, side: "home", down: 1, distance: 10 },
    });
  });

  test("a touchback lands in the end zone, then the ball goes to the spot the feed gives", () => {
    expect(play("3").segments).toEqual([
      { kind: "arc", from: 35, to: 105 },
      { kind: "possession", side: "home" },
      { kind: "jump", to: 75 },
    ]);
    // A punt into the end zone, the other way.
    expect(play("195").segments).toEqual([
      { kind: "arc", from: 40, to: -5 },
      { kind: "possession", side: "away" },
      { kind: "jump", to: 20 },
    ]);
  });

  test("a fair catch stops where it lands, unless the feed moves the ball on", () => {
    // A punt fair-caught at the LIB29 stays there.
    expect(play("478").segments).toEqual([
      { kind: "arc", from: 69, to: 29 },
      { kind: "possession", side: "away" },
    ]);
    // A kickoff fair-caught at the LIB04 comes out to the 25.
    expect(play("125").segments).toEqual([
      { kind: "arc", from: 65, to: 4 },
      { kind: "possession", side: "away" },
      { kind: "jump", to: 25 },
    ]);
  });

  test("a field goal arcs to the posts, flashes and scores, and the kicking team kicks off next", () => {
    expect(play("60")).toEqual({
      id: "40186994160",
      start: 89,
      side: "away",
      segments: [
        { kind: "arc", from: 89, to: 110 },
        { kind: "flash", label: "Field goal" },
        { kind: "score", home: 0, away: 3 },
      ],
      rest: { spot: 35, side: "away", down: null, distance: null },
    });
  });

  test("a NO PLAY penalty has no flight: the flag, then the slide", () => {
    // "PENALTY CCU False Start 5 yards from CCU25 to CCU20. NO PLAY"
    expect(play("69").segments).toEqual([{ kind: "penalty", flag: 75, from: 75, to: 80 }]);
  });

  test("a penalty on a play that stands animates the play, then the slide", () => {
    // "rush left for 5 yards gain to the LIB36 … PENALTY CCU Holding 10 yards from LIB36 to LIB46"
    expect(play("135")).toMatchObject({
      segments: [
        { kind: "ground", from: 31, to: 36 },
        { kind: "penalty", flag: 36, from: 36, to: 46 },
      ],
      rest: { spot: 46 },
    });
  });

  test("a declined penalty is just the play", () => {
    // "pass incomplete … thrown to LIB40 PENALTY CCU Holding declined"
    expect(play("97").segments).toEqual([
      { kind: "arc", from: 55, to: 40 },
      { kind: "miss", at: 40 },
      { kind: "jump", to: 55 },
    ]);
  });

  test("an interception arcs to where it was caught and swaps", () => {
    // "pass intercepted by #13 J.Vessel at LIB20"
    expect(play("29")).toMatchObject({
      segments: [
        { kind: "arc", from: 39, to: 20 },
        { kind: "possession", side: "away" },
      ],
      rest: { spot: 20, side: "away" },
    });
  });

  test("a fumble lost is a line to the fumble, a swap and the return, whatever the play type says", () => {
    // Filed as "Fumble Recovery (Own)", but "recovered by CCU": Liberty's sack, Coastal's ball.
    expect(play("262")).toMatchObject({
      side: "away",
      segments: [
        { kind: "ground", from: 89, to: 89 },
        { kind: "possession", side: "home" },
        { kind: "ground", from: 89, to: 73 },
      ],
      rest: { spot: 73, side: "home" },
    });
    // "rush middle for 5 yards gain to the CCU41 fumbled by #7 P.Jones at CCU40 … recovered by CCU … at CCU41"
    expect(play("662").segments).toEqual([
      { kind: "ground", from: 54, to: 60 },
      { kind: "possession", side: "home" },
      { kind: "ground", from: 60, to: 59 },
    ]);
  });

  test("a fumble the offense keeps is no swap", () => {
    expect(play("356")).toMatchObject({ segments: [{ kind: "ground", from: 74, to: 66 }], rest: { side: "away" } });
  });

  test("a turnover on downs animates the play, then swaps at rest", () => {
    expect(play("552")).toMatchObject({
      segments: [
        { kind: "ground", from: 46, to: 55 },
        { kind: "possession", side: "away" },
      ],
      rest: { spot: 55, side: "away", down: 1, distance: 10 },
    });
  });

  test("a touchdown ends at the goal line, flashes, counts six, then the extra point is its own step", () => {
    // Liberty 20, Coastal 17 before; "rush right for 8 yards gain to the CCU00 TOUCHDOWN … kick attempt good".
    expect(play("609")).toEqual({
      id: "401869941609",
      start: 92,
      side: "away",
      segments: [
        { kind: "ground", from: 92, to: 100 },
        { kind: "flash", label: "Touchdown" },
        { kind: "score", home: 17, away: 26 },
        { kind: "arc", from: 97, to: 110 },
        { kind: "score", home: 17, away: 27 },
      ],
      rest: { spot: 35, side: "away", down: null, distance: null },
    });
  });

  test.each([
    ["a timeout", "56"],
    ["the end of a quarter", "205"],
    ["the end of the game", "794"],
  ])("%s draws nothing and holds the last play's resting state", (_, suffix) => {
    const i = DESCRIBED.findIndex((d) => d.id === `401869941${suffix}`);
    expect(DESCRIBED[i].segments).toEqual([]);
    expect(DESCRIBED[i].rest).toEqual(DESCRIBED[i - 1].rest);
  });
});

describe("a play the feed revised", () => {
  // From docs/research/cfbd-live-plays/revisions.json: each play as first served, then as revised.
  const revised = (suffix: string, first: Partial<CfbdLivePlay>) => {
    const plays = upTo(suffix);
    const before = describePlays([...plays.slice(0, -1), { ...plays.at(-1)!, ...first }], TEAMS).at(-1)!;
    const after = describePlays(plays, TEAMS).at(-1)!;
    return { before, after };
  };

  test("a sack that became a NO PLAY penalty draws differently", () => {
    const { before, after } = revised("243", {
      playType: "Sack",
      yardsGained: -4,
      playText:
        "(10:58) No Huddle-Shotgun #5 D.Purdie sacked for loss of 8 yards to the LIB48 (#11 B.Starnes, #50 M.Toney)",
    });
    expect(before.segments).toEqual([{ kind: "ground", from: 56, to: 48 }]);
    expect(after.segments).toEqual([{ kind: "penalty", flag: 56, from: 56, to: 66 }]);
  });

  test("a run that became a fumble lost draws differently", () => {
    const { before, after } = revised("662", {
      playType: "Fumble",
      yardsGained: 6,
      playText:
        "(08:30) No Huddle-Shotgun #7 P.Jones rush middle for 6 yards gain to the CCU40 (#4 M.Pulliam; #94 D.Grayson)",
    });
    expect(before).toMatchObject({ segments: [{ kind: "ground", from: 54, to: 60 }], rest: { side: "away" } });
    expect(after.rest.side).toBe("home");
    expect(after.segments).not.toEqual(before.segments);
  });
});

describe("the newest play", () => {
  test("rests on the game header's next snap", () => {
    const newest = describePlays(upTo("249"), TEAMS, { down: 2, distance: 7, yardsToGoal: 31 }).at(-1)!;
    expect(newest.rest).toEqual({ spot: 69, side: "away", down: 2, distance: 7 });
  });

  test("with no spot in its words, jumps to the header's spot", () => {
    const plays = upTo("249");
    const garbled = { ...plays.at(-1)!, playText: "K.Davis something the parser has never seen" };
    const newest = describePlays([...plays.slice(0, -1), garbled], TEAMS, { down: 2, distance: 7, yardsToGoal: 31 }).at(
      -1,
    )!;
    expect(newest.segments).toEqual([{ kind: "jump", to: 69 }]);
  });
});

describe("the fallback", () => {
  test("an unrecognised play is one jump to where the next play starts", () => {
    const i = PLAYS.findIndex((p) => p.id === "40186994121");
    const plays = PLAYS.map((p, j) =>
      j === i ? { ...p, playType: "Unknown", playText: "Something new happened" } : p,
    );
    expect(describePlays(plays, TEAMS)[i].segments).toEqual([{ kind: "jump", to: 39 }]);
  });

  test("never throws, whatever the feed sends", () => {
    const junk = PLAYS.slice(0, 3).map((p) => ({
      ...p,
      yardsToGoal: null,
      playText: "PENALTY from to NO PLAY TOUCHDOWN",
    }));
    expect(() => describePlays(junk, TEAMS)).not.toThrow();
    expect(() => describePlays(PLAYS, { homeTeamId: 1, awayTeamId: 2 })).not.toThrow();
    expect(describePlays([], TEAMS)).toEqual([]);
  });

  test("a safety, unseen so far, runs into the end zone, flashes and scores, and the team scored on kicks", () => {
    const [snap] = upTo("21").slice(-1);
    const safety = {
      ...snap,
      yardsToGoal: 98,
      homeScore: 0,
      awayScore: 2,
      playType: "Safety",
      playText: "(13:56) Shotgun #2 D.Bailey sacked for loss of 3 yards, SAFETY",
    };
    expect(describePlays([safety], TEAMS)[0]).toMatchObject({
      segments: [
        { kind: "ground", from: 98, to: 102 },
        { kind: "flash", label: "Safety" },
        { kind: "score", home: 0, away: 2 },
      ],
      rest: { side: "home" },
    });
  });
});

describe("the Live Board's football", () => {
  test("after the kickoff at r01 is Coastal's, though the header names Liberty", () => {
    // r01 00:20:52Z: newest play Liberty's kickoff returned to the LIB49; the header read "Liberty, 1st & 10, 49 to go".
    expect(ballSide(upTo("161"), TEAMS, { down: 1, distance: 10, yardsToGoal: 49 })).toBe("home");
  });

  test("holds through a timeout", () => {
    expect(ballSide(upTo("56"), TEAMS, null)).toBe("away");
  });

  test.each([
    ["the end of a quarter", "205"],
    ["halftime", "421"],
    ["the final", "794"],
  ])("is nobody's at %s", (_, suffix) => {
    expect(ballSide(upTo(suffix), TEAMS, null)).toBeNull();
  });
});
