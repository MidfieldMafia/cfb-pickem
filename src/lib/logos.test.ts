import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { gameDetail, week1 } from "./scoring/fixtures/week-1-2026";
import { FALLBACK_TEAM_COLOR, findLogo, findLogoByEspnId, logoSrc, teamColor, teamLogos } from "./logos";

describe("logo index", () => {
  it("resolves a school by display name and by ESPN id", () => {
    expect(findLogo("Alabama")?.slug).toBe("alabama");
    expect(findLogoByEspnId(333)?.school).toBe("Alabama");
  });

  it("resolves an ampersand school through the slug", () => {
    expect(findLogo("Texas A&M")?.slug).toBe("texas-aandm");
  });

  it("falls back to the border token rather than inventing a color", () => {
    // Akron is one of the 105 schools shipped without a verified color pair.
    expect(findLogo("Akron")?.colors).toBeUndefined();
    expect(teamColor("Akron")).toBe(FALLBACK_TEAM_COLOR);
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
