import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import { describePlays, type PlayDescription } from "./field";
import { BALL_Y, drawingKey, feedBefore, fieldX, frame, newestDrawn, timeline } from "./field-player";
import { gameFeed, type GamePlaysJson } from "./game-feed";

// Liberty at Coastal Carolina: Liberty (LIB, 2335) is away and attacks towards 100, Coastal (CCU, 324) home.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335, homeTeam: "Coastal Carolina", awayTeam: "Liberty" };
const DRIVES = LIBERTY_AT_COASTAL_FINAL.drives;
const id = (suffix: string) => `401869941${suffix}`;

/** The endpoint's answer while the play ending in `suffix` was the newest. */
function feedThrough(suffix: string, drives: CfbdLiveDrive[] = DRIVES): GamePlaysJson {
  const kept: CfbdLiveDrive[] = [];
  for (const drive of drives) {
    const at = drive.plays.findIndex((play) => play.id === id(suffix));
    kept.push(at === -1 ? drive : { ...drive, plays: drive.plays.slice(0, at + 1) });
    if (at !== -1) break;
  }
  return gameFeed(
    {
      gameId: 1,
      fetchedAt: "2026-09-20T20:00:00.000Z",
      drives: kept,
      descriptions: describePlays(
        kept.flatMap((drive) => drive.plays),
        TEAMS,
      ),
      final: null,
    },
    TEAMS,
  );
}

const WHOLE = feedThrough("349");
function described(suffix: string): PlayDescription {
  const found = WHOLE.plays.find((play) => play.id === id(suffix));
  if (!found) throw new Error(`no play …${suffix}`);
  return found.description;
}

describe("timeline", () => {
  test("a run takes the canvas's 2.8 s", () => {
    const line = timeline(described("21"));
    expect(line.ms).toBe(2800);
    expect(line.loss).toBe(false);
  });

  test("a catch and the run after it share one flight at a constant speed", () => {
    // Arc 42 → 59 (17 yards), then the ground to the goal line (41 yards).
    const line = timeline(described("153"));
    const [arc, ground] = line.steps;
    expect(arc.ms + ground.ms).toBeCloseTo(2800);
    expect(arc.ms / ground.ms).toBeCloseTo(17 / 41);
  });

  test("a touchdown waits for the +6 to count before the extra point flies", () => {
    const steps = timeline(described("153"), { was: { home: 3, away: 3 } }).steps;
    const six = steps.find((s) => s.kind === "score")!;
    const kick = steps.findLast((s) => s.kind === "arc")!;
    expect(six.ms).toBe(6 * 145);
    expect(kick.t0).toBe(six.t0 + six.ms);
    expect(kick.ms).toBe(1400);
  });

  test("a sack draws its trail in red", () => {
    expect(timeline(described("54")).loss).toBe(true);
  });

  test("with reduced motion the play lands at once", () => {
    expect(timeline(described("153"), { still: true }).ms).toBe(0);
  });
});

describe("frame", () => {
  test("the ball starts on the spot and ends where the play rests", () => {
    const play = described("21");
    const line = timeline(play);
    expect(frame(play, line, 0).ball).toEqual({ x: fieldX(59), y: BALL_Y, angle: 0 });
    const end = frame(play, line, line.ms);
    expect(end.ball.x).toBeCloseTo(fieldX(39));
    expect(end.done).toBe(true);
    expect(end.moved).toBe(true);
  });

  test("an arc rises in flight and tilts along its path", () => {
    const play = described("338");
    const mid = frame(play, timeline(play), 1400);
    expect(mid.ball.y).toBeLessThan(BALL_Y);
    expect(mid.ball.angle).not.toBe(0);
  });

  test("an incompletion marks the thrown-to spot with the X, then the ball goes back to the line", () => {
    const play = described("66");
    const end = frame(play, timeline(play), Infinity);
    expect(end.miss).toBe(fieldX(48));
    expect(end.ball.x).toBe(fieldX(75));
  });

  test("a NO PLAY penalty drops the flag at the old spot and slides the ball", () => {
    const play = described("150");
    const line = timeline(play);
    expect(frame(play, line, 200)).toMatchObject({ flag: fieldX(47), ball: { x: fieldX(47) } });
    expect(frame(play, line, line.ms).ball.x).toBe(fieldX(42));
  });

  test("the kicking team's logo rides the kick until the possession step", () => {
    const play = described("161");
    const line = timeline(play);
    expect(frame(play, line, 500).side).toBe("away");
    expect(frame(play, line, line.ms).side).toBe("home");
  });

  test("the score steps +6 then +1, and only once the ball has landed", () => {
    const play = described("153");
    const line = timeline(play);
    const six = line.steps.find((s) => s.kind === "score")!;
    expect(frame(play, line, six.t0 - 1).score).toBeNull();
    expect(frame(play, line, six.t0)).toMatchObject({ score: { home: 3, away: 9 }, flash: "Touchdown" });
    expect(frame(play, line, line.ms).score).toEqual({ home: 3, away: 10 });
  });

  test("a turnover's callout appears as the ball reaches the spot, and stays", () => {
    // "pass intercepted by #13 J.Vessel at LIB20": Liberty's ball at its own 20.
    const play = described("29");
    const line = timeline(play);
    const swap = line.steps.find((s) => s.kind === "turnover")!;
    expect(frame(play, line, swap.t0 - 1).turnover).toBeNull();
    expect(frame(play, line, swap.t0).turnover).toEqual({ label: "Interception", x: fieldX(20), side: "away" });
    expect(frame(play, line, Infinity).turnover).toEqual({ label: "Interception", x: fieldX(20), side: "away" });
    expect(frame(described("21"), timeline(described("21")), Infinity).turnover).toBeNull();
  });

  test("a lost fumble's callout waits for the ball to reach the recovery", () => {
    // "fumbled by #7 P.Jones at CCU40 … recovered by CCU #19 S.McDowell at CCU41".
    const final = feedThrough(DRIVES.at(-1)!.plays.at(-1)!.id.slice(9));
    const play = final.plays.find((p) => p.id === id("662"))!.description;
    const line = timeline(play);
    const swap = line.steps.find((s) => s.kind === "turnover")!;
    expect(frame(play, line, swap.t0 - 1).turnover).toBeNull();
    expect(frame(play, line, swap.t0)).toMatchObject({
      ball: { x: fieldX(59) },
      turnover: { label: "Fumble", x: fieldX(59), side: "home" },
    });
  });

  test("a blocked field goal's callout goes up with the X, at the block", () => {
    // William & Mary at Duke, respelled: "NO GOOD blocked by … recovered by CCU Coastal at CCU36".
    const plays = DRIVES.flatMap((drive) => drive.plays);
    const at = plays.findIndex((play) => play.id === id("60"));
    const blocked = {
      ...plays[at],
      yardsToGoal: 36,
      homeScore: 0,
      awayScore: 0,
      playText:
        "(06:52) #43 M.Lipinski field goal attempt from 53 yards NO GOOD blocked by #34 L.Mergott (H: #16 P.Blee, LS: #50 M.Kabban), clock 06:41 recovered by CCU Coastal at CCU36, End Of Play",
    };
    const play = describePlays([...plays.slice(0, at), blocked], TEAMS).at(-1)!;
    const line = timeline(play);
    const landed = frame(play, line, Infinity);
    expect(landed).toMatchObject({ miss: fieldX(67), turnover: { label: "Blocked kick", x: fieldX(67), side: "home" } });
    expect(landed.ball.x).toBe(fieldX(64));
    const x = line.steps.find((s) => s.kind === "miss")!;
    expect(frame(play, line, x.t0 - 1)).toMatchObject({ miss: null, turnover: null });
  });

  test("the extra point starts a trail of its own", () => {
    const play = described("153");
    const trail = frame(play, timeline(play), Infinity).trail;
    expect(trail.match(/M/g)).toHaveLength(2);
  });
});

describe("which play animates", () => {
  test("the newest play that draws anything, past a timeout", () => {
    expect(newestDrawn(WHOLE)?.id).toBe(id("343"));
  });

  test("a change in the words alone keeps the drawing's key", () => {
    const play = described("21");
    expect(drawingKey({ ...play, rest: { ...play.rest, down: 4 } })).toBe(drawingKey(play));
    expect(drawingKey({ ...play, segments: [{ kind: "ground", from: 59, to: 40 }] })).not.toBe(drawingKey(play));
  });
});

describe("feedBefore", () => {
  test("leaves out the play in the air and everything after it", () => {
    const before = feedBefore(WHOLE, id("338"));
    expect(before.plays.at(-1)?.id).toBe(id("333"));
    expect(before.plays).toEqual(WHOLE.plays.slice(0, before.plays.length));
    expect(before.drive).toBe(WHOLE.drive);
    expect(before.recap).toEqual(WHOLE.recap);
  });

  test("drops the recap when the play in the air opened the newest drive", () => {
    const through = feedThrough("314");
    const before = feedBefore(through, id("314"));
    expect(before.drive).toBe(through.drive - 1);
    expect(before.recap).toBeNull();
  });
});
