import { describe, expect, test } from "vitest";
import { kickoffDay, kickoffLine, kickoffTime } from "./kickoff";

// Saturday, September 27, 2025, 7:30 PM in Chicago.
const KICKOFF = new Date("2025-09-28T00:30:00Z");
const CHICAGO = "America/Chicago";

describe("kickoffDay", () => {
  test("is Today on the viewer's own calendar day, even where UTC has moved on", () => {
    expect(kickoffDay(KICKOFF, new Date("2025-09-27T14:00:00Z"), CHICAGO)).toBe("Today");
    expect(kickoffDay(KICKOFF, new Date("2025-09-27T14:00:00Z"), "UTC")).toBe("Tomorrow");
  });

  test("is Tomorrow the day before", () => {
    expect(kickoffDay(KICKOFF, new Date("2025-09-26T23:00:00Z"), CHICAGO)).toBe("Tomorrow");
  });

  test("is the weekday within the coming week", () => {
    expect(kickoffDay(KICKOFF, new Date("2025-09-23T15:00:00Z"), CHICAGO)).toBe("Saturday");
    expect(kickoffDay(KICKOFF, new Date("2025-09-21T15:00:00Z"), CHICAGO)).toBe("Saturday");
  });

  test("is the short date a week or more out", () => {
    expect(kickoffDay(KICKOFF, new Date("2025-09-20T15:00:00Z"), CHICAGO)).toBe("Sat, Sep 27");
  });
});

describe("kickoffTime and kickoffLine", () => {
  test("read in the viewer's zone", () => {
    expect(kickoffTime(KICKOFF, CHICAGO)).toBe("7:30 PM");
    expect(kickoffLine(KICKOFF, CHICAGO)).toBe("7:30 PM, Saturday, September 27");
  });
});
