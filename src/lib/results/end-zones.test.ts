import { describe, expect, test } from "vitest";
import { CREAM, END_ZONE, INK, NAME_ROOM, endZone, fitName, teamFill, textOn } from "./end-zones";

describe("teamFill", () => {
  test("is the school's primary, even one that looks like the turf", () => {
    expect(teamFill("Mississippi State")).toBe("#660000");
    expect(teamFill("Oregon")).toBe("#154733");
  });

  test("is today's end zone pine for a school logos.ts doesn't have, such as an FCS opponent", () => {
    expect(teamFill("Howard")).toBe(END_ZONE);
  });
});

describe("textOn", () => {
  test("is cream or ink, whichever contrasts more", () => {
    expect(textOn("#660000")).toBe(CREAM);
    expect(textOn("#FFCD00")).toBe(INK);
    expect(textOn("#FF8200")).toBe(INK);
    expect(textOn(END_ZONE)).toBe(CREAM);
  });
});

describe("endZone", () => {
  test("names the school, then its short name, then the feed's abbreviation, in caps", () => {
    expect(endZone("Mississippi State", "MSST")).toEqual({
      fill: "#660000",
      ink: CREAM,
      names: ["MISSISSIPPI STATE", "MISS. STATE", "MSST"],
    });
  });

  test("tries each name once", () => {
    expect(endZone("Iowa", "IOWA").names).toEqual(["IOWA"]);
    expect(endZone("Howard", "HOW")).toEqual({ fill: END_ZONE, ink: CREAM, names: ["HOWARD", "HOW"] });
  });
});

describe("fitName", () => {
  // A stand-in for the browser's measure: 10 units a letter.
  const width = (name: string) => name.length * 10;

  test("takes the first name that fits in the strip", () => {
    expect(fitName(["MISSISSIPPI STATE", "MISS. STATE", "MSST"], width)).toBe("MSST");
    expect(fitName(["OREGON", "ORE"], width)).toBe("OREGON");
    expect(fitName(["LOUISIANA", "ULL"], (name) => name.length * 11)).toBe("LOUISIANA");
  });

  test("falls back to the last when nothing fits, never to nothing", () => {
    expect(fitName(["MISSISSIPPI STATE", "MISS. STATE"], width)).toBe("MISS. STATE");
    expect(fitName([], width)).toBe("");
  });

  test("leaves the strip's 112 units some room", () => {
    expect(NAME_ROOM).toBe(100);
  });
});
