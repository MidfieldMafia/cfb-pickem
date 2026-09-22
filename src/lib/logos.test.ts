import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { gameDetail, week1 } from "./scoring/fixtures/week-1-2026";
import { conferences, FALLBACK_TEAM_COLOR, findLogo, findLogoByEspnId, logoSrc, teamColor, teamLogos } from "./logos";

describe("logo index", () => {
  it("resolves a school by display name and by ESPN id", () => {
    expect(findLogo("Alabama")?.slug).toBe("alabama");
    expect(findLogoByEspnId(333)?.school).toBe("Alabama");
  });

  it("resolves an ampersand school through the slug", () => {
    expect(findLogo("Texas A&M")?.slug).toBe("texas-aandm");
  });

  it("resolves CFBD feed names that diverge from the asset slug", () => {
    expect(findLogo("Florida International")?.slug).toBe("fiu");
    expect(findLogo("App State")?.slug).toBe("appalachian-state");
    expect(findLogo("Massachusetts")?.slug).toBe("umass");
  });

  it("carries a color pair for every school", () => {
    expect(teamLogos.filter((t) => !t.colors).map((t) => t.slug)).toEqual([]);
  });

  it("falls back to the border token for a school it does not know", () => {
    expect(findLogo("Hogwarts")).toBeUndefined();
    expect(teamColor("Hogwarts")).toBe(FALLBACK_TEAM_COLOR);
  });

  it("files every school in a conference, and groups them without reading array order", () => {
    expect(teamLogos.filter((t) => !t.conference).map((t) => t.slug)).toEqual([]);
    expect(conferences.reduce((n, c) => n + c.teams.length, 0)).toBe(teamLogos.length);
    expect(conferences.map((c) => `${c.name} ${c.teams.length}`)).toEqual([
      "SEC 16",
      "Big Ten 18",
      "Big 12 16",
      "ACC 17",
      "Independent 2",
      "American 14",
      "Mountain West 12",
      "Pac-12 2",
      "Sun Belt 14",
      "MAC 13",
      "Conference USA 12",
    ]);
  });

  it("points every entry at files that exist in public/", () => {
    const missing = teamLogos.filter((t) => !existsSync(`public/${t.file}`) || !existsSync(`public/${t.small}`));
    expect(missing.map((t) => t.slug)).toEqual([]);
  });
});

describe("Week 1 fixture joins to presentation data", () => {
  it("has detail for every game on the slate", () => {
    const undetailed = week1.games.filter((g) => !gameDetail(g.id));
    expect(undetailed.map((g) => g.id)).toEqual([]);
  });

  it("resolves a logo for every team on the slate", () => {
    const teams = week1.games.flatMap((g) => [g.homeTeam, g.awayTeam]);
    expect(teams.filter((t) => !logoSrc(t))).toEqual([]);
  });
});
