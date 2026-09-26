import { describe, expect, test } from "vitest";
import { findLogo, type TeamColors } from "@/lib/logos";
import { barColors, BLACK, CARD, ciede2000, contrast, DARK, deltaE2000, LIGHT_GRAY, MIN_CONTRAST, tooAlike } from "./bar-colors";

const colors = (school: string): TeamColors => {
  const logo = findLogo(school);
  if (!logo) throw new Error(`${school} is not in logos.ts`);
  return logo.colors;
};
const pair = (away: string | undefined, home: string | undefined) =>
  barColors(away === undefined ? undefined : colors(away), home === undefined ? undefined : colors(home));

describe("the measures", () => {
  test("contrast is WCAG's: black on white is 21:1, a colour on itself 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21);
    expect(contrast(CARD, CARD)).toBeCloseTo(1);
  });

  test("CIEDE2000 matches the published test data and tells the reds apart the way an eye does", () => {
    // Sharma, Wu & Dalal (2005), pairs 1, 25 and 34.
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(ciede2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
    expect(ciede2000([22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619])).toBeCloseTo(2.0373, 4);
    expect(deltaE2000("#123456", "#123456")).toBe(0);
    // Ohio State's red and Georgia's are one colour on a bar; Georgia red and Michigan navy are not.
    expect(tooAlike("#BB0000", "#BA0C2F")).toBe(true);
    expect(tooAlike("#BA0C2F", "#00274C")).toBe(false);
    // Texas orange and Ohio State red, at 16, fall on the cautious side of the cut-off.
    expect(deltaE2000("#BF5700", "#BB0000")).toBeCloseTo(16.4, 1);
    expect(tooAlike("#BF5700", "#BB0000")).toBe(true);
    // Black by a navy reads as one bar: Southern Miss and BYU, at 22, are too alike.
    expect(tooAlike(BLACK, "#002E5D")).toBe(true);
    // Michigan navy and Florida State garnet count as dark beside black; Georgia red does not.
    expect(deltaE2000("#00274C", BLACK)).toBeLessThan(DARK);
    expect(deltaE2000("#782F40", BLACK)).toBeLessThan(DARK);
    expect(deltaE2000("#BA0C2F", BLACK)).toBeGreaterThan(DARK);
  });
});

describe("bar colours", () => {
  test("two usable primaries that differ: both keep them", () => {
    expect(pair("Oklahoma", "Michigan")).toEqual({ away: "#841617", home: "#00274C" });
  });

  test("the same colour twice: the away team takes its alternate so home keeps its primary", () => {
    // Ohio State red at Georgia red: Ohio State's gray is its alternate.
    expect(pair("Ohio State", "Georgia")).toEqual({ away: "#666666", home: "#BA0C2F" });
  });

  test("Tennessee's orange fails 3:1 on the card, so its gray is its only colour", () => {
    expect(contrast(colors("Tennessee").primary, CARD)).toBeLessThan(MIN_CONTRAST);
    expect(pair("Tennessee", "Georgia")).toEqual({ away: "#58595B", home: "#BA0C2F" });
    // At home it keeps the gray too, and the away team is free to use its primary.
    expect(pair("Alabama", "Tennessee")).toEqual({ away: "#9E1B32", home: "#58595B" });
  });

  test("Georgia Tech's gold clears 3:1 by a hair, so it is a primary like any other", () => {
    expect(contrast(colors("Georgia Tech").primary, CARD)).toBeCloseTo(3.0005, 4);
    expect(pair("Georgia Tech", "Michigan")).toEqual({ away: "#A28D5B", home: "#00274C" });
    expect(pair("Georgia Tech", "Alabama")).toEqual({ away: "#A28D5B", home: "#9E1B32" });
  });

  test("two navies and nothing else: the away bar goes light gray, since black would sit by navy", () => {
    // UTEP's orange fails 3:1 and Michigan's maize does too, so each has only its navy.
    expect(pair("UTEP", "Michigan")).toEqual({ away: LIGHT_GRAY, home: "#00274C" });
  });

  test("a school missing from logos.ts takes the fallback: black beside a bar that isn't dark, light gray beside one that is", () => {
    expect(pair("Georgia", undefined)).toEqual({ away: "#BA0C2F", home: BLACK });
    // Florida A&M is FCS. Miami's orange fails 3:1, so its green stands, and that green is dark.
    expect(pair(undefined, "Miami")).toEqual({ away: LIGHT_GRAY, home: "#005030" });
  });

  test("when neither side has a usable colour, home is black and away light gray", () => {
    // UCF and North Carolina are two of the five schools with no colour at 3:1.
    expect(pair("UCF", "North Carolina")).toEqual({ away: LIGHT_GRAY, home: BLACK });
    expect(pair(undefined, undefined)).toEqual({ away: LIGHT_GRAY, home: BLACK });
  });

  test("every school's pair against every other is two colours, each usable or a fallback", () => {
    // Not the rule restated: a guard that no pairing throws or returns something unshowable.
    const all = ["Tennessee", "Georgia Tech", "Ohio State", "Georgia", "Michigan", "UCF", "Miami", "Texas", "UTEP"];
    for (const away of all) {
      for (const home of all) {
        const { away: a, home: h } = pair(away, home);
        for (const c of [a, h]) {
          expect(contrast(c, CARD) >= MIN_CONTRAST || c === LIGHT_GRAY).toBe(true);
        }
        // Two alike bars only ever when one of them is the gray that gives way.
        expect(a === LIGHT_GRAY || h === LIGHT_GRAY || !tooAlike(a, h)).toBe(true);
      }
    }
  });
});
