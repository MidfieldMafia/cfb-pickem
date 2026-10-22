import { describe, expect, it } from "vitest";
import { CREAM } from "./end-zones";
import { PINE_FIELD, fieldFor, numberedYards } from "./fields";

describe("fieldFor", () => {
  it("draws a signature field at home", () => {
    expect(fieldFor("Boise State", false).turf).toBe("#2150A6");
    expect(fieldFor("Eastern Michigan", false)).toMatchObject({ turf: "#4B5255", numbers: 0.9, tens: 0.55, fives: 0.25 });
    expect(fieldFor("Coastal Carolina", false).homeZone).toEqual({ fill: "#16120F", ink: CREAM });
  });
  it("keeps pine for LSU's turf but numbers every 5 yards at 8px", () => {
    const lsu = fieldFor("LSU", false);
    expect(lsu.turf).toBe(PINE_FIELD.turf);
    expect(lsu.numberSize).toBe(8);
    expect(lsu.numberStep).toBe(5);
  });
  it("keeps pine for a neutral site, a missing neutralSite is not neutral, and other schools", () => {
    expect(fieldFor("Boise State", true)).toBe(PINE_FIELD);
    expect(fieldFor("Georgia", false)).toBe(PINE_FIELD);
    expect(fieldFor("Boise State", undefined).turf).toBe("#2150A6");
    expect(PINE_FIELD).toMatchObject({ turf: "#1F4034", numbers: 0.7, tens: 0.45, fives: 0.2, numberSize: 10, numberStep: 10 });
  });
});

describe("a stored game's detail", () => {
  // The sheet passes `detail?.neutralSite`: a snapshot from before the field, or a game with no detail at all, is undefined.
  const field = (detail: { neutralSite?: boolean } | null, home: string) => fieldFor(home, detail?.neutralSite);
  it("draws the school's field unless the stored flag says neutral", () => {
    expect(field({ neutralSite: true }, "Coastal Carolina")).toBe(PINE_FIELD);
    expect(field({ neutralSite: false }, "Coastal Carolina").turf).toBe("#0F5F62");
    expect(field({}, "Coastal Carolina").turf).toBe("#0F5F62");
    expect(field(null, "LSU").numberStep).toBe(5);
  });
});

describe("numberedYards", () => {
  it("runs 5, 10 … 50 … 10, 5 every 5 yards", () => {
    const labels = numberedYards(5).map((n) => n.label);
    expect(labels).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5]);
  });
  it("numbers every 10 yards by default", () => {
    expect(numberedYards(10).map((n) => n.label)).toEqual([10, 20, 30, 40, 50, 40, 30, 20, 10]);
  });
});
