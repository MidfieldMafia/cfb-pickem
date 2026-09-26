import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import { recapPreviousDrive } from "./drive-recap";
import { describePlays, type PlayDescription } from "./field";
import {
  BALL_Y,
  drawingKey,
  feedBefore,
  fieldX,
  frame,
  newestDrawn,
  readout,
  spotLabel,
  timeline,
} from "./field-player";
import type { GamePlaysJson } from "./live-feed";

// Liberty at Coastal Carolina: Liberty (LIB, 2335) is away and attacks towards 100, Coastal (CCU, 324) home.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335, homeTeam: "Coastal Carolina", awayTeam: "Liberty" };
const LABELS = { home: "CCU", away: "LIB" };
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
  return {
    gameId: 1,
    fetchedAt: "2026-09-20T20:00:00.000Z",
    drives: kept,
    descriptions: describePlays(
      kept.flatMap((drive) => drive.plays),
      TEAMS,
    ),
    recap: recapPreviousDrive(kept, TEAMS),
    final: null,
  };
}

const WHOLE = feedThrough("349");
function described(suffix: string): PlayDescription {
  const found = WHOLE.descriptions.find((d) => d.id === id(suffix));
  if (!found) throw new Error(`no play …${suffix}`);
  return found;
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
    const ids = before.drives.flatMap((d) => d.plays.map((p) => p.id));
    expect(ids.at(-1)).toBe(id("333"));
    expect(before.descriptions.map((d) => d.id)).toEqual(ids);
    expect(before.recap).toEqual(WHOLE.recap);
  });

  test("drops the recap when the play in the air opened the newest drive", () => {
    const before = feedBefore(feedThrough("314"), id("314"));
    expect(before.drives).toHaveLength(7);
    expect(before.recap).toBeNull();
  });
});

describe("readout", () => {
  test("a play mid-drive: the down, the spot, and the drive so far", () => {
    // Coastal's drive from its own 25 after the touchback: 20-yard run to the LIB39.
    expect(readout(WHOLE, id("21"), TEAMS, LABELS)).toMatchObject({
      down: "1st & 10",
      spot: "LIB 39",
      drive: "3 plays, 36 yds",
      ball: 39,
      gain: 29,
      driveStart: 75,
      side: "home",
      unmoved: false,
      clock: "Q1 · 13:50",
    });
  });

  test("a drive that has not moved shows the chevron", () => {
    // An incompletion on the first snap after the kickoff.
    expect(readout(WHOLE, id("128"), TEAMS, LABELS)).toMatchObject({
      down: "2nd & 10",
      drive: "1 play, 0 yds",
      unmoved: true,
    });
  });

  test("a kick starts the receiving team's drive", () => {
    expect(readout(WHOLE, id("195"), TEAMS, LABELS)).toMatchObject({
      down: "1st & 10",
      spot: "LIB 20",
      drive: "Just started",
      side: "away",
      unmoved: true,
    });
  });

  test("an interception starts a drive for the other side", () => {
    expect(readout(WHOLE, id("29"), TEAMS, LABELS)).toMatchObject({
      drive: "Just started",
      side: "away",
      driveStart: 20,
    });
  });

  test("a touchdown reads the kickoff next and the drive to the goal line", () => {
    expect(readout(WHOLE, id("153"), TEAMS, LABELS)).toMatchObject({
      down: "Kickoff",
      drive: "7 plays, 75 yds",
      gain: null,
      driveStart: null,
      unmoved: false,
      score: { home: 3, away: 10 },
    });
  });

  test("a score keeps its end zone lit at rest", () => {
    expect(readout(WHOLE, id("153"), TEAMS, LABELS).flash).toEqual({ label: "Touchdown", yard: 100 });
    expect(readout(WHOLE, id("122"), TEAMS, LABELS).flash).toEqual({ label: "Field goal", yard: -10 });
    expect(readout(WHOLE, id("21"), TEAMS, LABELS).flash).toBeNull();
  });

  test("goal to go", () => {
    // Liberty on the CCU8, 1st & 8.
    const game = feedThrough(DRIVES.at(-1)!.plays.at(-1)!.id.slice(9));
    expect(readout(game, id("755"), TEAMS, LABELS)).toMatchObject({ down: "1st & Goal", spot: "CCU 8", gain: 100 });
  });
});

describe("spotLabel", () => {
  test("names the half the ball is in", () => {
    expect(spotLabel(28, LABELS)).toBe("LIB 28");
    expect(spotLabel(72, LABELS)).toBe("CCU 28");
    expect(spotLabel(50, LABELS)).toBe("50");
    expect(spotLabel(-3, LABELS)).toBe("End zone");
  });
});
