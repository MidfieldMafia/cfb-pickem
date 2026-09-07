/**
 * The three pills and the search box over the week's candidates. Run against
 * the real recorded Week 2 feed rather than hand-written candidates, because
 * the rule under test is about the matchup — either side ranked, either side
 * in the SEC — and a fixture built to suit would not catch it reading one.
 */
import { describe, expect, test } from "vitest";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import { filterParam, FILTERS, matches } from "./candidate-filter";

const WEEK_2 = { year: 2026, week: 2 };

/** Week 2 of 2026 as the feed recorded it: 86 games, 23 with a ranked side, 15 touching the SEC. */
const week2 = () => weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, recordedOpenMeteo("2026-week-2"));

describe("the ?filter= a commissioner asked for", () => {
  test("takes the three pills and nothing else", () => {
    expect(FILTERS.map((f) => f.key)).toEqual(["all", "ranked", "sec"]);
    expect(filterParam("all")).toBe("all");
    expect(filterParam("ranked")).toBe("ranked");
    expect(filterParam("sec")).toBe("sec");
  });

  test("falls back to all FBS when the query string is missing or nonsense", () => {
    expect(filterParam(undefined)).toBe("all");
    expect(filterParam("")).toBe("all");
    expect(filterParam("acc")).toBe("all");
    // Not a case-insensitive match: the pills build the links, so only their own spelling counts.
    expect(filterParam("SEC")).toBe("all");
  });
});

describe("which candidates survive the pills", () => {
  test('"all" keeps the whole week', async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "all", ""))).toHaveLength(86);
  });

  test('"ranked" asks whether either side is ranked, not both', async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "ranked", ""))).toHaveLength(23);
    // 21 of those 23 are ranked on one side only, so a rule reading both sides would keep 2.
    for (const c of candidates.filter((c) => matches(c, "ranked", ""))) {
      expect(c.homeRank !== null || c.awayRank !== null).toBe(true);
    }
    for (const c of candidates.filter((c) => !matches(c, "ranked", ""))) {
      expect(c).toMatchObject({ homeRank: null, awayRank: null });
    }
  });

  test('"ranked" counts a ranked home team and a ranked away team alike', async () => {
    const candidates = await week2();
    // Florida A&M (unranked) at Miami (7): the ranked side is at home.
    const rankedHome = candidates.find((c) => c.cfbdGameId === 401858213)!;
    // Missouri (25) at Kansas (unranked): the ranked side is away.
    const rankedAway = candidates.find((c) => c.cfbdGameId === 401856678)!;

    expect(rankedHome).toMatchObject({ awayRank: null, homeRank: 7 });
    expect(rankedAway).toMatchObject({ awayRank: 25, homeRank: null });
    expect(matches(rankedHome, "ranked", "")).toBe(true);
    expect(matches(rankedAway, "ranked", "")).toBe(true);
  });

  test('"sec" asks whether either side is in it, not both', async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "sec", ""))).toHaveLength(15);
    // Only one of the 15 is an all-SEC game, so a rule reading both sides would keep 1.
    for (const c of candidates.filter((c) => !matches(c, "sec", ""))) {
      expect(c.homeConference).not.toBe("SEC");
      expect(c.awayConference).not.toBe("SEC");
    }
  });

  test('"sec" counts an SEC home team and an SEC away team alike', async () => {
    const candidates = await week2();
    // Arizona State (Big 12) at Texas A&M (SEC): the SEC side is at home.
    const secHome = candidates.find((c) => c.cfbdGameId === 401856683)!;
    // Oklahoma (SEC) at Michigan (Big Ten): the SEC side is away.
    const secAway = candidates.find((c) => c.cfbdGameId === 401856679)!;

    expect(secHome).toMatchObject({ awayConference: "Big 12", homeConference: "SEC" });
    expect(secAway).toMatchObject({ awayConference: "SEC", homeConference: "Big Ten" });
    expect(matches(secHome, "sec", "")).toBe(true);
    expect(matches(secAway, "sec", "")).toBe(true);
  });
});

describe("the search box", () => {
  test("matches either team, ignoring case", async () => {
    const candidates = await week2();
    // Texas hosts Ohio State; the away team is the one spelled in the query.
    const texas = candidates.find((c) => c.cfbdGameId === 401856682)!;

    expect(matches(texas, "all", "ohio state")).toBe(true);
    expect(matches(texas, "all", "OHIO STATE")).toBe(true);
    expect(matches(texas, "all", "texas")).toBe(true);
    expect(matches(texas, "all", "clemson")).toBe(false);
  });

  test("an empty query filters nothing", async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "all", ""))).toHaveLength(candidates.length);
  });

  test("a pill and a query both have to pass", async () => {
    const candidates = await week2();
    // Missouri at Kansas is SEC on the away side, so the pill passes and only the query decides.
    const missouri = candidates.find((c) => c.cfbdGameId === 401856678)!;

    expect(matches(missouri, "sec", "kansas")).toBe(true);
    expect(matches(missouri, "sec", "alabama")).toBe(false);
    // Both sides ranked, so the pill passes here too and the query is again the only question.
    const texas = candidates.find((c) => c.cfbdGameId === 401856682)!;
    expect(matches(texas, "ranked", "ohio state")).toBe(true);
  });
});
