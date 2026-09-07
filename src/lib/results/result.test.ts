import { describe, expect, test } from "vitest";
import { clockLabel } from "./result";

/**
 * The one spelling of where a game in progress stands. Three screens put it
 * beside a score, and the feed's own shape — a padded clock, a period that
 * counts past four for overtime — is not what a person reads.
 */
describe("the clock label", () => {
  test("reads the quarter and the clock, without the feed's leading zero", () => {
    expect(clockLabel({ period: 3, clock: "08:12" })).toBe("Q3 · 8:12");
    expect(clockLabel({ period: 1, clock: "15:00" })).toBe("Q1 · 15:00");
    expect(clockLabel({ period: 2, clock: "00:00" })).toBe("Q2 · 0:00");
  });

  test("calls the fifth period overtime and counts from there", () => {
    expect(clockLabel({ period: 5, clock: "02:00" })).toBe("OT · 2:00");
    expect(clockLabel({ period: 6, clock: null })).toBe("2OT");
  });

  test("says only what the feed has said, and nothing when it has said nothing", () => {
    expect(clockLabel({ period: 4, clock: null })).toBe("Q4");
    expect(clockLabel({ period: null, clock: "05:30" })).toBe("5:30");
    expect(clockLabel({ period: null, clock: null })).toBeNull();
  });
});
