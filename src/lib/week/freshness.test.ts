import { describe, expect, test } from "vitest";
import { agoLabel, dueInLabel } from "./freshness";

describe("agoLabel", () => {
  test("reads as \"just now\" for the first few seconds", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(9_000)).toBe("just now");
  });

  test("counts seconds once the gap is worth naming", () => {
    expect(agoLabel(10_000)).toBe("10s ago");
    expect(agoLabel(59_000)).toBe("59s ago");
  });

  test("moves to minutes at a minute", () => {
    expect(agoLabel(60_000)).toBe("1m ago");
    expect(agoLabel(59 * 60_000)).toBe("59m ago");
  });

  test("moves to hours and minutes at an hour", () => {
    expect(agoLabel(60 * 60_000)).toBe("1h 00m ago");
    expect(agoLabel(90 * 60_000)).toBe("1h 30m ago");
  });

  test("never reads negative, whatever clock skew hands it", () => {
    expect(agoLabel(-500)).toBe("just now");
  });
});

describe("dueInLabel", () => {
  test("rounds up to whole seconds", () => {
    expect(dueInLabel(1)).toBe("in 1s");
    expect(dueInLabel(29_001)).toBe("in 30s");
  });

  test("moves to minutes at a minute", () => {
    expect(dueInLabel(60_000)).toBe("in 1m");
    expect(dueInLabel(5 * 60_000)).toBe("in 5m");
  });

  test("never announces a check as already due", () => {
    expect(dueInLabel(0)).toBe("in 1s");
    expect(dueInLabel(-500)).toBe("in 1s");
  });
});
