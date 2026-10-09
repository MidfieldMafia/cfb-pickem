/**
 * The feed names the favorite and the panel shows a number over each team, so
 * the away side of the row is sometimes the line and sometimes its mirror.
 * Getting the two the wrong way round shows a member the wrong favorite, which
 * is why this is a function with tests rather than a ternary in the markup.
 */
import { describe, expect, test } from "vitest";
import { isFavoredLine, spreadHeadline, spreadSides } from "./spread";

describe("spreadSides", () => {
  test("the favorite carries the line and the underdog carries its mirror", () => {
    expect(spreadSides("Georgia −6.5", "Georgia")).toEqual(["−6.5", "+6.5"]);
    expect(spreadSides("Georgia −6.5", "Alabama")).toEqual(["+6.5", "−6.5"]);
  });

  test("reads the feed's ASCII hyphen as well as the typographic minus", () => {
    expect(spreadSides("Georgia -6.5", "Georgia")).toEqual(["-6.5", "+6.5"]);
    expect(spreadSides("Georgia -6.5", "Alabama")).toEqual(["+6.5", "-6.5"]);
  });

  test("a whole-number line keeps its form on both sides", () => {
    expect(spreadSides("Texas −3", "Texas")).toEqual(["−3", "+3"]);
    expect(spreadSides("Texas −14", "Ohio State")).toEqual(["+14", "−14"]);
  });

  test("a pick'em is PK on both sides, with no favorite to name", () => {
    expect(spreadSides("Pick", "Michigan")).toEqual(["PK", "PK"]);
    expect(spreadSides("PK", "Michigan")).toEqual(["PK", "PK"]);
  });

  test("a multi-word team name is not mistaken for part of the line", () => {
    expect(spreadSides("Ohio State −7.5", "Ohio State")).toEqual(["−7.5", "+7.5"]);
    expect(spreadSides("Notre Dame −2.5", "Texas A&M")).toEqual(["+2.5", "−2.5"]);
  });

  test("a team whose name starts with the other's is not taken for the favorite", () => {
    // "Texas Tech -3" begins with "Texas", so a prefix match would favor both.
    expect(spreadSides("Texas Tech -3", "Texas Tech")).toEqual(["-3", "+3"]);
    expect(spreadSides("Texas Tech -3", "Texas")).toEqual(["+3", "-3"]);
    expect(spreadSides("Texas −3", "Texas Tech")).toEqual(["+3", "−3"]);
  });

  test("a hyphenated team name keeps its hyphen", () => {
    // The line is matched on a *space* then a sign, so "Miami-OH" survives.
    expect(spreadSides("Miami-OH −1.5", "Miami-OH")).toEqual(["−1.5", "+1.5"]);
    expect(spreadSides("Miami-OH −1.5", "Buffalo")).toEqual(["+1.5", "−1.5"]);
  });
});

describe("isFavoredLine", () => {
  test("only the side carrying the minus is the favorite", () => {
    expect(isFavoredLine("−6.5")).toBe(true);
    expect(isFavoredLine("-6.5")).toBe(true);
    expect(isFavoredLine("+6.5")).toBe(false);
    expect(isFavoredLine("PK")).toBe(false);
  });
});

describe("spreadHeadline", () => {
  test("writes a true minus sign and spells out a pick'em", () => {
    expect(spreadHeadline("Georgia -6.5")).toBe("Georgia −6.5");
    expect(spreadHeadline("Georgia −6.5")).toBe("Georgia −6.5");
    expect(spreadHeadline("Miami-OH -1.5")).toBe("Miami-OH −1.5");
    expect(spreadHeadline("Pick")).toBe("Pick");
    expect(spreadHeadline("PK")).toBe("Pick");
  });
});
