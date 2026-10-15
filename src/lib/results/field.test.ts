import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLivePlay } from "@/lib/cfbd/types";
import { abbreviations, ballSide, describePlays, sideOf, type PlayDescription } from "./field";

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

describe("other spellings of a spot", () => {
  // The same game as 2026-09-26's feeds spelled their spots: "OU 28" (padded), "State33" and "Mizzou45" (mixed case).
  const respelled = (home: string, away: string) =>
    PLAYS.map((p) => ({
      ...p,
      playText: p.playText
        .replace(/\bCCU(\d{2})/g, `${home}$1`)
        .replace(/\bLIB(\d{2})/g, `${away}$1`)
        .replace(/\bCCU\b/g, home.trim())
        .replace(/\bLIB\b/g, away.trim()),
    }));

  test.each([
    ["State", "OU "],
    ["Mizzou", "OU "],
  ])(
    "spelled %s31 and %s31, the abbreviations vote for their sides and the whole game draws as it does",
    (home, away) => {
      const plays = respelled(home, away);
      const sides = abbreviations(plays, (id) => (id === 324 ? "home" : id === 2335 ? "away" : null));
      expect(Object.fromEntries(sides)).toEqual({ [home]: "home", [away.trim()]: "away" });
      expect(describePlays(plays, TEAMS)).toEqual(DESCRIBED);
    },
  );

  test("a penalty's yards are not a spot, so one placed abbreviation still names the other", () => {
    const [snap] = upTo("21").slice(-1);
    const plays = [
      { ...snap, yardsToGoal: 29, playText: "(12:21) Shotgun #9 L.Avant rush middle for 1 yard gain to the OU 28" },
      { ...snap, playText: "(11:40) Shotgun #9 L.Avant fumbled by #9 L.Avant at State40" },
      { ...snap, playText: "(11:02) PENALTY OU Holding 10 yards enforced" },
    ];
    const sides = abbreviations(plays, (id) => (id === 324 ? "home" : id === 2335 ? "away" : null));
    expect(Object.fromEntries(sides)).toEqual({ OU: "away", State: "home" });
  });

  test("a run to the OU 28 is a ground line", () => {
    // Coastal (home) snapping from the OU 29.
    const [snap] = upTo("21").slice(-1);
    const run = {
      ...snap,
      yardsToGoal: 29,
      playText: "(12:21) No Huddle-Shotgun #9 L.Avant rush middle for 1 yard gain to the OU 28",
    };
    expect(describePlays([run], TEAMS)[0].segments).toEqual([{ kind: "ground", from: 29, to: 28 }]);
  });

  test("an interception at Mizzou45 is an arc and a swap", () => {
    const plays = respelled("Mizzou", "OU ");
    const i = plays.findIndex((p) => p.id === "40186994121");
    const pick = {
      ...plays[i],
      playType: "Pass Interception Return",
      playText: "(8:02) Shotgun #1 B.Pyburn pass intercepted by #4 T.Greco at Mizzou45",
    };
    const described = describePlays([...plays.slice(0, i), pick], TEAMS)[i];
    expect(described.segments.map((s) => s.kind)).toEqual(["arc", "possession", "turnover"]);
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
        { kind: "turnover", label: "Interception", at: 20, side: "away" },
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
        // "recovered by CCU #19 S.McDowell at #19 S.McDowell": no spot, so the callout points where the ball came out.
        { kind: "turnover", label: "Fumble", at: 89, side: "home" },
        { kind: "ground", from: 89, to: 73 },
      ],
      rest: { spot: 73, side: "home" },
    });
    // "rush middle for 5 yards gain to the CCU41 fumbled by #7 P.Jones at CCU40 … recovered by CCU … at CCU41"
    expect(play("662").segments).toEqual([
      { kind: "ground", from: 54, to: 60 },
      { kind: "possession", side: "home" },
      { kind: "turnover", label: "Fumble", at: 59, side: "home" },
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
        { kind: "turnover", label: "Turnover on downs", at: 55, side: "away" },
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

describe("turnover callouts (#435)", () => {
  // Each play is CFBD's own words from a 2026 game (/plays, weeks 4 to 6), respelled for Liberty (LIB, away) and Coastal (CCU, home).
  /** The play ending in `suffix` swapped for another, everything before it kept: its description. */
  const swapped = (suffix: string, changes: Partial<CfbdLivePlay>) => {
    const plays = upTo(suffix);
    return describePlays([...plays.slice(0, -1), { ...plays.at(-1)!, ...changes }], TEAMS).at(-1)!;
  };
  /** Liberty's field goal unit, play …60 before it scored, snapping from `yardsToGoal` out. */
  const libertyKicks = (yardsToGoal: number, playText: string) =>
    swapped("60", { yardsToGoal, homeScore: 0, awayScore: 0, playText });
  const turnovers = (description: PlayDescription) => description.segments.filter((s) => s.kind === "turnover");

  test("a blocked field goal hops to the block, marks the X there, and the callout is the blocking team's", () => {
    // William & Mary at Duke: "NO GOOD blocked by … recovered by DUKE Duke at DUKE36".
    const blocked = libertyKicks(
      36,
      "(06:52) #43 M.Lipinski field goal attempt from 53 yards NO GOOD blocked by #34 L.Mergott (H: #16 P.Blee, LS: #50 M.Kabban), clock 06:41 recovered by CCU Coastal at CCU36, End Of Play",
    );
    expect(blocked).toMatchObject({
      start: 64,
      segments: [
        { kind: "arc", from: 64, to: 67 },
        { kind: "miss", at: 67 },
        { kind: "possession", side: "home" },
        { kind: "turnover", label: "Blocked kick", at: 67, side: "home" },
        { kind: "ground", from: 67, to: 64 },
      ],
      rest: { spot: 64, side: "home" },
    });
  });

  test("a blocked field goal returned runs on to the recovery and the return's end", () => {
    // Texas Southern at Alcorn State: "recovered by ASU #25 E.Ruffin at ASU17 #25 E.Ruffin return 13 yards to the ASU30".
    const returned = libertyKicks(
      13,
      "#10 M.Arana field goal attempt from 30 yards NO GOOD blocked by #40 L.Carson (H: #50 B.Mays Jr, LS: #51 I.Mbagwu), clock 04:28 recovered by CCU #25 E.Ruffin at CCU17 #25 E.Ruffin return 13 yards to the CCU30 (#51 I.Mbagwu)",
    );
    expect(returned.segments.slice(-2)).toEqual([
      { kind: "ground", from: 90, to: 83 },
      { kind: "ground", from: 83, to: 70 },
    ]);
    expect(returned.rest).toMatchObject({ spot: 70, side: "home" });
  });

  test("a blocked field goal that went out of bounds at the block stays there", () => {
    // Campbell at Hampton: "NO GOOD blocked by #90 C.Jackson …, clock 09:38, out of bounds at HAM15".
    const out = libertyKicks(
      18,
      "#29 K.Robison field goal attempt from 35 yards NO GOOD blocked by #90 C.Jackson (H: #86 A.McIntosh, LS: #35 L.Wilson II), clock 09:38, out of bounds at CCU15",
    );
    expect(out.segments).toEqual([
      { kind: "arc", from: 82, to: 85 },
      { kind: "miss", at: 85 },
      { kind: "possession", side: "home" },
      { kind: "turnover", label: "Blocked kick", at: 85, side: "home" },
    ]);
    expect(out.rest.spot).toBe(85);
  });

  test("a missed field goal keeps only its X", () => {
    const missed = libertyKicks(
      20,
      "#25 B.Janki field goal attempt from 37 yards NO GOOD (H: #12 J.Alley, LS: #57 M.Thompson), clock 08:04",
    );
    expect(missed.segments).toEqual([
      { kind: "arc", from: 80, to: 100 },
      { kind: "miss", at: 100 },
      { kind: "possession", side: "home" },
    ]);
  });

  test("a pick six shows the callout at the catch and the Touchdown flash at the goal line", () => {
    // South Carolina at Alabama: "pass intercepted by #6 R.Morgan at USC23 #6 R.Morgan return 23 yards to the USC00 TOUCHDOWN".
    const pickSix = swapped("21", {
      yardsToGoal: 85,
      homeScore: 0,
      awayScore: 7,
      playType: "Interception Return Touchdown",
      playText:
        "(02:25) Shotgun #16 L.Sellers pass intercepted by #6 R.Morgan at CCU23 #6 R.Morgan return 23 yards to the CCU00 TOUCHDOWN, clock 02:20 #31 C.Talty kick attempt good (H: #32 A.Asparuhov, LS: #55 A.Rozier)",
    });
    expect(pickSix.segments.slice(0, 5)).toEqual([
      { kind: "arc", from: 85, to: 77 },
      { kind: "possession", side: "away" },
      { kind: "turnover", label: "Interception", at: 77, side: "away" },
      { kind: "ground", from: 77, to: 100 },
      { kind: "flash", label: "Touchdown" },
    ]);
  });

  test("a blocked punt is a Blocked kick where it fell, then the return", () => {
    // Marist at Presbyterian: "punt 0 yards to the PRESBY42 blocked by … recovered by MAR … return 24 yards to the PRESBY00 TOUCHDOWN".
    const blocked = swapped("60", {
      yardsToGoal: 58,
      homeScore: 7,
      awayScore: 0,
      playType: "Punt Return Touchdown",
      playText:
        "#27 T.Hutton punt 0 yards to the LIB42 blocked by #24 J.Bernabei recovered by CCU #14 J.Taylor at LIB24 #14 J.Taylor return 24 yards to the LIB00 TOUCHDOWN, clock 01:41 #46 L.Stenson kick attempt good (H: #10 M.Lainez III, LS: #49 B.Ganny)",
    });
    expect(blocked.segments.slice(0, 5)).toEqual([
      { kind: "arc", from: 42, to: 42 },
      { kind: "possession", side: "home" },
      { kind: "turnover", label: "Blocked kick", at: 42, side: "home" },
      { kind: "ground", from: 42, to: 0 },
      { kind: "flash", label: "Touchdown" },
    ]);
  });

  test("a muffed punt the kicking team recovers is a Fumble at the recovery", () => {
    // Harvard at Brown: "punt 37 yards to the BROWN49 muffed by #27 C.Davis at BROWN49 recovered by HARV #15 X.Benson at BROWN48".
    const muffed = libertyKicks(
      86,
      "#95 B.Checkley punt 37 yards to the CCU49 muffed by #27 C.Davis at CCU49 recovered by LIB #15 X.Benson at CCU48, End Of Play",
    );
    expect(muffed).toMatchObject({
      segments: [
        { kind: "arc", from: 14, to: 51 },
        { kind: "ground", from: 51, to: 52 },
        { kind: "turnover", label: "Fumble", at: 52, side: "away" },
      ],
      rest: { spot: 52, side: "away" },
    });
  });

  test("a muff the receiving team falls on and a blocked extra point get no callout", () => {
    // Northwestern at Indiana: "muffed by #29 L.Beebe Jr. at IND06 recovered by IND #29 L.Beebe Jr. at IND06".
    const ownMuff = libertyKicks(
      65,
      "(06:34) #98 N.Sur kickoff 59 yards to the CCU06 muffed by #29 L.Beebe Jr. at CCU06 recovered by CCU #29 L.Beebe Jr. at CCU06, End Of Play",
    );
    // Eastern Washington at Cal Poly: "kick attempt failed ( blocked by #94 J.Njelita)".
    const blockedTry = swapped("21", {
      yardsToGoal: 35,
      homeScore: 6,
      awayScore: 0,
      playType: "Passing Touchdown",
      playText:
        "No Huddle-Shotgun #2 N.Bell pass complete deep middle to #14 D.Cabrera caught at LIB00, for 35 yards to the LIB00 TOUCHDOWN, clock 01:32, 1ST DOWN #16 S.McKee kick attempt failed ( blocked by #94 J.Njelita) (H: #2 N.Bell, LS: #52 B.Nield)",
    });
    expect(turnovers(ownMuff)).toEqual([]);
    expect(turnovers(blockedTry)).toEqual([]);
    expect(blockedTry.segments).toContainEqual({ kind: "flash", label: "Touchdown" });
  });

  test("the whole final game calls out its interceptions, lost fumbles and turnovers on downs, and no block", () => {
    const called = DESCRIBED.flatMap((d) =>
      d.segments.flatMap((s) => (s.kind === "turnover" ? [`${d.id.slice(9)} ${s.label}`] : [])),
    );
    expect(called).toEqual(expect.arrayContaining(["29 Interception", "262 Fumble", "552 Turnover on downs", "662 Fumble"]));
    expect(called.filter((c) => c.endsWith("Blocked kick"))).toEqual([]);
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

describe("sideOf", () => {
  test("names the side a team id plays on", () => {
    expect(sideOf(TEAMS)(324)).toBe("home");
    expect(sideOf(TEAMS)(2335)).toBe("away");
    expect(sideOf(TEAMS)(1)).toBeNull();
  });
});
