/**
 * The pills, the FBS-only toggle, and the search box over the week's
 * candidates. Run against the real recorded Week 2 feed rather than
 * hand-written candidates, because the rules under test are about the
 * matchup — either side ranked, either side in a conference, both sides FBS — and
 * a fixture built to suit would not catch one of them reading wrong.
 */
import { describe, expect, test } from "vitest";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import { fbsOnlyParam, filterParam, FILTERS, matches } from "./candidate-filter";

const WEEK_2 = { year: 2026, week: 2 };

/**
 * Week 2 of 2026 as the feed recorded it: 86 games, 23 with a ranked side, 49
 * both-FBS, and 15 touching the SEC, 17 the Big Ten, 14 the ACC and 15 the
 * Big 12.
 */
const week2 = () => weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, recordedOpenMeteo("2026-week-2"));

describe("the ?filter= a commissioner asked for", () => {
  test("takes the six pills and nothing else", () => {
    expect(FILTERS.map((f) => f.label)).toEqual(["All", "Ranked", "SEC", "Big Ten", "ACC", "Big 12"]);
    for (const { key } of FILTERS) expect(filterParam(key)).toBe(key);
  });

  test("falls back to all FBS when the query string is missing or nonsense", () => {
    expect(filterParam(undefined)).toBe("all");
    expect(filterParam("")).toBe("all");
    expect(filterParam("pac-12")).toBe("all");
    // Not a case-insensitive match: the pills build the links, so only their own spelling counts.
    expect(filterParam("SEC")).toBe("all");
    expect(filterParam("Big Ten")).toBe("all");
  });
});

describe("the ?fbs= a commissioner asked for", () => {
  test("defaults to filtered — a missing or nonsense param means fbs-only", () => {
    expect(fbsOnlyParam(undefined)).toBe(true);
    expect(fbsOnlyParam("")).toBe(true);
    expect(fbsOnlyParam("1")).toBe(true);
    expect(fbsOnlyParam("true")).toBe(true);
  });

  test('only an explicit "0" turns it off', () => {
    expect(fbsOnlyParam("0")).toBe(false);
  });
});

describe("which candidates survive the pills", () => {
  test('"all" keeps the whole week', async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "all", false, ""))).toHaveLength(86);
  });

  test('"ranked" asks whether either side is ranked, not both', async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "ranked", false, ""))).toHaveLength(23);
    // 21 of those 23 are ranked on one side only, so a rule reading both sides would keep 2.
    for (const c of candidates.filter((c) => matches(c, "ranked", false, ""))) {
      expect(c.homeRank !== null || c.awayRank !== null).toBe(true);
    }
    for (const c of candidates.filter((c) => !matches(c, "ranked", false, ""))) {
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
    expect(matches(rankedHome, "ranked", false, "")).toBe(true);
    expect(matches(rankedAway, "ranked", false, "")).toBe(true);
  });

  test('"sec" counts an SEC home team and an SEC away team alike', async () => {
    const candidates = await week2();
    // Arizona State (Big 12) at Texas A&M (SEC): the SEC side is at home.
    const secHome = candidates.find((c) => c.cfbdGameId === 401856683)!;
    // Oklahoma (SEC) at Michigan (Big Ten): the SEC side is away.
    const secAway = candidates.find((c) => c.cfbdGameId === 401856679)!;

    expect(secHome).toMatchObject({ awayConference: "Big 12", homeConference: "SEC" });
    expect(secAway).toMatchObject({ awayConference: "SEC", homeConference: "Big Ten" });
    expect(matches(secHome, "sec", false, "")).toBe(true);
    expect(matches(secAway, "sec", false, "")).toBe(true);
  });
});

describe("the conference pills", () => {
  // CFBD's own spelling of each conference, which is what a candidate carries.
  // At most one game per conference is an all-conference game (none for the
  // Big Ten), so a rule reading both sides would keep at most 1.
  test.each([
    ["sec", "SEC", 15],
    ["big-ten", "Big Ten", 17],
    ["acc", "ACC", 14],
    ["big-12", "Big 12", 15],
  ] as const)('"%s" keeps every game with a side in the %s and nothing else', async (filter, conference, count) => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, filter, false, ""))).toHaveLength(count);
    for (const c of candidates) {
      const inIt = c.homeConference === conference || c.awayConference === conference;
      expect(matches(c, filter, false, "")).toBe(inIt);
    }
  });

  test("a game between two of them shows under both pills", async () => {
    const candidates = await week2();
    // Rutgers (Big Ten) at Boston College (ACC).
    const bigTenAtAcc = candidates.find((c) => c.cfbdGameId === 401858214)!;
    // Iowa State (Big 12) at Iowa (Big Ten).
    const big12AtBigTen = candidates.find((c) => c.cfbdGameId === 401856788)!;

    expect(bigTenAtAcc).toMatchObject({ awayConference: "Big Ten", homeConference: "ACC" });
    expect(matches(bigTenAtAcc, "big-ten", false, "")).toBe(true);
    expect(matches(bigTenAtAcc, "acc", false, "")).toBe(true);
    expect(matches(bigTenAtAcc, "big-12", false, "")).toBe(false);
    expect(matches(bigTenAtAcc, "sec", false, "")).toBe(false);

    expect(big12AtBigTen).toMatchObject({ awayConference: "Big 12", homeConference: "Big Ten" });
    expect(matches(big12AtBigTen, "big-12", false, "")).toBe(true);
    expect(matches(big12AtBigTen, "big-ten", false, "")).toBe(true);
    expect(matches(big12AtBigTen, "acc", false, "")).toBe(false);
  });
});

describe("the FBS-only toggle", () => {
  test("on hides a game unless both sides are classified fbs", async () => {
    const candidates = await week2();
    const surviving = candidates.filter((c) => matches(c, "all", true, ""));

    expect(surviving).toHaveLength(49);
    for (const c of surviving) {
      expect(c.homeClassification).toBe("fbs");
      expect(c.awayClassification).toBe("fbs");
    }
  });

  test("is the opposite polarity of the SEC pill — both sides, not either", async () => {
    const candidates = await week2();
    // Miami (fbs) hosts Florida A&M (fcs): one non-FBS side is enough to hide it.
    const cupcake = candidates.find((c) => c.cfbdGameId === 401858213)!;

    expect(cupcake).toMatchObject({ homeClassification: "fbs", awayClassification: "fcs" });
    expect(matches(cupcake, "all", true, "")).toBe(false);
    expect(matches(cupcake, "all", false, "")).toBe(true);
  });

  test("off shows the whole week again", async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "all", false, ""))).toHaveLength(86);
  });

  test("composes with the pills and the search box", async () => {
    const candidates = await week2();
    // Missouri at Kansas is SEC on the away side and both teams are FBS.
    const missouri = candidates.find((c) => c.cfbdGameId === 401856678)!;
    expect(matches(missouri, "sec", true, "kansas")).toBe(true);
    expect(matches(missouri, "sec", true, "alabama")).toBe(false);

    // Florida A&M at Miami is ranked (Miami, 7) but is still a cupcake.
    const rankedCupcake = candidates.find((c) => c.cfbdGameId === 401858213)!;
    expect(matches(rankedCupcake, "ranked", false, "")).toBe(true);
    expect(matches(rankedCupcake, "ranked", true, "")).toBe(false);
  });
});

describe("the search box", () => {
  test("matches either team, ignoring case", async () => {
    const candidates = await week2();
    // Texas hosts Ohio State; the away team is the one spelled in the query.
    const texas = candidates.find((c) => c.cfbdGameId === 401856682)!;

    expect(matches(texas, "all", false, "ohio state")).toBe(true);
    expect(matches(texas, "all", false, "OHIO STATE")).toBe(true);
    expect(matches(texas, "all", false, "texas")).toBe(true);
    expect(matches(texas, "all", false, "clemson")).toBe(false);
  });

  test("an empty query filters nothing", async () => {
    const candidates = await week2();

    expect(candidates.filter((c) => matches(c, "all", false, ""))).toHaveLength(candidates.length);
  });

  test("a pill and a query both have to pass", async () => {
    const candidates = await week2();
    // Missouri at Kansas is SEC on the away side, so the pill passes and only the query decides.
    const missouri = candidates.find((c) => c.cfbdGameId === 401856678)!;

    expect(matches(missouri, "sec", false, "kansas")).toBe(true);
    expect(matches(missouri, "sec", false, "alabama")).toBe(false);
    // Both sides ranked, so the pill passes here too and the query is again the only question.
    const texas = candidates.find((c) => c.cfbdGameId === 401856682)!;
    expect(matches(texas, "ranked", false, "ohio state")).toBe(true);
  });
});
