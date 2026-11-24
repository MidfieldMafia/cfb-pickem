import { describe, expect, it } from "vitest";
import logos from "@/lib/logos.json";
import rivalries from "@/data/rivalries.json";
import { rivalryOf } from "./rivalry";

const eggBowl = { awayTeam: "Mississippi State", homeTeam: "Ole Miss" };

describe("rivalryOf", () => {
  it("names a rivalry game and its trophy while the Rivalry Week Look is on", () => {
    expect(rivalryOf("rivalry", eggBowl)).toEqual({ name: "Egg Bowl", trophy: "Golden Egg" });
  });

  it("matches with home and away either way round", () => {
    const flipped = { awayTeam: "Ole Miss", homeTeam: "Mississippi State" };
    expect(rivalryOf("rivalry", flipped)).toEqual({ name: "Egg Bowl", trophy: "Golden Egg" });
  });

  it("gives a rivalry with no trophy its name alone", () => {
    expect(rivalryOf("rivalry", { awayTeam: "Auburn", homeTeam: "Alabama" })).toEqual({
      name: "Iron Bowl",
      trophy: null,
    });
  });

  it("names nothing for an ordinary game", () => {
    expect(rivalryOf("rivalry", { awayTeam: "Oklahoma", homeTeam: "Michigan" })).toBeNull();
  });

  it("names nothing for one school of a rivalry playing someone else", () => {
    expect(rivalryOf("rivalry", { awayTeam: "Mississippi State", homeTeam: "Alabama" })).toBeNull();
  });

  it("names nothing while the Look is off", () => {
    expect(rivalryOf(null, eggBowl)).toBeNull();
  });
});

describe("the rivalry data file", () => {
  it("names every school as the slate does, by its logos.json name", () => {
    const schools = new Set(logos.map((logo) => logo.school));
    const unknown = rivalries.flatMap((r) => [r.home, r.away]).filter((school) => !schools.has(school));
    expect(unknown).toEqual([]);
  });

  it("holds each pairing once", () => {
    const pairs = rivalries.map((r) => [r.home, r.away].sort().join(" | "));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("names each trophy without its article, since the screens read \"For the <trophy>\"", () => {
    const articled = rivalries.filter((r) => r.trophy?.startsWith("The "));
    expect(articled).toEqual([]);
  });
});
