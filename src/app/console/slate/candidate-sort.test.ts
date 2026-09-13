/**
 * The Kickoff and Spread sorts over the week's candidates. Run against the
 * real recorded Week 2 feed, like `candidate-filter.test.ts`, because the
 * rule under test — an unplaced game sinks to the bottom regardless of
 * direction — is about the shape of real data (a mix of booked, model-only,
 * and line-less games) rather than a hand-built fixture built to suit.
 */
import { describe, expect, test } from "vitest";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import { matches } from "./candidate-filter";
import { dirParam, sortCandidates, sortParam, SORTS } from "./candidate-sort";

const WEEK_2 = { year: 2026, week: 2 };
const rain = recordedOpenMeteo("2026-week-2");

const week2 = () => weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);

/** The earliest kickoff in the recorded week, forced TBD without touching the fixture file. */
async function week2WithATbdOpener(): Promise<CandidateGame[]> {
  const base = recordedCfbd("2026-week-2");
  const games = await base.games(WEEK_2);
  const opener = [...games].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))[0];
  return weekCandidates(
    recordedCfbd("2026-week-2", { games: games.map((g) => (g.id === opener.id ? { ...g, startTimeTBD: true } : g)) }),
    WEEK_2,
    rain,
  );
}

describe("the ?sort= and ?dir= a commissioner asked for", () => {
  test("takes the two columns and nothing else", () => {
    expect(SORTS.map((s) => s.key)).toEqual(["kickoff", "spread"]);
    expect(sortParam("kickoff")).toBe("kickoff");
    expect(sortParam("spread")).toBe("spread");
  });

  test("falls back to kickoff when the query string is missing or nonsense", () => {
    expect(sortParam(undefined)).toBe("kickoff");
    expect(sortParam("")).toBe("kickoff");
    expect(sortParam("tv")).toBe("kickoff");
  });

  test("dir falls back to asc unless the query string says desc", () => {
    expect(dirParam(undefined)).toBe("asc");
    expect(dirParam("")).toBe("asc");
    expect(dirParam("descending")).toBe("asc");
    expect(dirParam("desc")).toBe("desc");
  });
});

describe("sorting by spread", () => {
  test("orders by absolute margin, not the signed number", async () => {
    const candidates = await week2();
    const sorted = sortCandidates(candidates, "spread", "asc");
    const placed = sorted.filter((c) => c.spreadValue !== null);

    expect(placed.length).toBeGreaterThan(0);
    for (let i = 1; i < placed.length; i++) {
      expect(Math.abs(placed[i]!.spreadValue!)).toBeGreaterThanOrEqual(Math.abs(placed[i - 1]!.spreadValue!));
    }

    // Oklahoma -1.5 at Michigan is among the week's tightest book lines; Ole Miss
    // over Charlotte is its biggest blowout, model-priced since no book posted it.
    const oklahoma = sorted.findIndex((c) => c.cfbdGameId === 401856679);
    const oleMiss = sorted.findIndex((c) => c.cfbdGameId === 401856676);
    expect(oklahoma).toBeGreaterThanOrEqual(0);
    expect(oklahoma).toBeLessThan(oleMiss);
  });

  test("falls back to the win-probability model when no book has posted", async () => {
    const candidates = await week2();
    // Boston College at Rutgers has no book line; the model still prices it.
    const bc = candidates.find((c) => c.cfbdGameId === 401858214)!;

    expect(bc.spread).toBeNull();
    expect(bc.spreadValue).toBe(-3.5);
  });

  test("a line-less, model-less game sorts last regardless of direction", async () => {
    const candidates = await week2();
    const noNumber = candidates.filter((c) => c.spreadValue === null);
    expect(noNumber.length).toBeGreaterThan(0);

    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortCandidates(candidates, "spread", dir);
      const tail = sorted.slice(sorted.length - noNumber.length);
      expect(tail.every((c) => c.spreadValue === null)).toBe(true);
      expect(sorted.slice(0, sorted.length - noNumber.length).every((c) => c.spreadValue !== null)).toBe(true);
    }
  });

  test("desc reverses the placed rows only, not the whole list", async () => {
    const candidates = await week2();
    const asc = sortCandidates(candidates, "spread", "asc").filter((c) => c.spreadValue !== null);
    const desc = sortCandidates(candidates, "spread", "desc").filter((c) => c.spreadValue !== null);

    expect(desc).toEqual([...asc].reverse());
  });
});

describe("sorting by kickoff", () => {
  test("asc is the feed's own order; desc reverses it", async () => {
    const candidates = await week2();
    const asc = sortCandidates(candidates, "kickoff", "asc");
    const desc = sortCandidates(candidates, "kickoff", "desc");

    expect(asc.map((c) => c.cfbdGameId)).toEqual(candidates.map((c) => c.cfbdGameId));
    expect(desc).toEqual([...asc].reverse());
  });

  test("a TBD kickoff sorts last regardless of direction, even the week's earliest game", async () => {
    const candidates = await week2WithATbdOpener();
    const tbd = candidates.find((c) => c.kickoffTbd)!;

    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortCandidates(candidates, "kickoff", dir);
      expect(sorted.at(-1)!.cfbdGameId).toBe(tbd.cfbdGameId);
    }
  });
});

describe("composing with the pills, the FBS toggle, and the search box", () => {
  test("sorts only what survives the filter", async () => {
    const candidates = await week2();
    const ranked = candidates.filter((c) => matches(c, "ranked", false, ""));
    const sorted = sortCandidates(ranked, "spread", "asc");

    expect(sorted).toHaveLength(ranked.length);
    expect(new Set(sorted.map((c) => c.cfbdGameId))).toEqual(new Set(ranked.map((c) => c.cfbdGameId)));
    const placed = sorted.filter((c) => c.spreadValue !== null);
    for (let i = 1; i < placed.length; i++) {
      expect(Math.abs(placed[i]!.spreadValue!)).toBeGreaterThanOrEqual(Math.abs(placed[i - 1]!.spreadValue!));
    }
  });
});
