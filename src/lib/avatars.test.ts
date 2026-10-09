import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { pennantDataUri, type PennantDesign } from "@saturday-slate/design-system";
import { avatars, findAvatar, ownAvatarId, ownDesign, photoAvatarId, teamAvatarConferences, teamAvatarId } from "./avatars";
import { findLogo, teamLogos } from "./logos";

const SAGE_BANDS: PennantDesign = { flag: "sage", pattern: "twinbands", patternColor: "pine", pole: "stone", bg: "auto" };

describe("pennants", () => {
  it("resolves one of the fifteen flags, drawn from its design", () => {
    expect(avatars).toHaveLength(15);
    const flag = avatars[0];
    expect(findAvatar(flag.id)).toEqual(flag);
    expect(flag).toEqual({
      id: "pennants-04",
      name: "Moss Dot",
      file: pennantDataUri({ flag: "moss", pattern: "dot", patternColor: "ink", pole: "ink", bg: "auto" }),
      color: "#6A9449",
      kind: "flag",
    });
  });

  it("orders the presets by likely use, under the ids already saved plus 21 to 24", () => {
    expect(avatars.map((a) => `${a.id} ${a.name}`)).toEqual([
      "pennants-04 Moss Dot",
      "pennants-17 Slate Cross",
      "pennants-07 Ink Block",
      "pennants-16 Pine Sash",
      "pennants-06 Maroon Chevrons",
      "pennants-14 Copper Tip",
      "pennants-22 Sky Star",
      "pennants-19 Teal Rails",
      "pennants-15 Gold Diamond",
      "pennants-21 Pink Bars",
      "pennants-23 Ink Twin Bands",
      "pennants-13 Sage Twin Bands",
      "pennants-20 Plum Chevron",
      "pennants-18 Stone Pips",
      "pennants-24 Moss Trim",
    ]);
  });

  it("lets Oxblood Bars and the retired flags fall back to the initial", () => {
    for (const n of ["01", "02", "03", "05", "08", "09", "10", "11", "12"]) {
      expect(findAvatar(`pennants-${n}`)).toBeUndefined();
    }
  });

  it("resolves a member's own flag with no database, drawn by the same function", () => {
    const id = ownAvatarId(SAGE_BANDS);
    expect(id).toBe("own-sage-twinbands-pine-stone-auto");
    expect(findAvatar(id)).toEqual({ id, name: "Sage Twin Bands", file: pennantDataUri(SAGE_BANDS), color: "#5C9A74", kind: "flag" });
    expect(ownDesign(id)).toEqual(SAGE_BANDS);
  });

  it("tints an own flag's disc with its background when it has one", () => {
    const id = ownAvatarId({ ...SAGE_BANDS, bg: "plum" });
    expect(id).toBe("own-sage-twinbands-pine-stone-plum");
    expect(findAvatar(id)?.color).toBe("#4A2B45");
  });

  it("keeps a design that matches a preset as the member's own", () => {
    expect(findAvatar(ownAvatarId(SAGE_BANDS))?.id).not.toBe("pennants-13");
  });

  it("allows a pattern the same color as the flag, which the maker only warns about", () => {
    expect(findAvatar("own-plum-star-plum-ink-auto")).toBeDefined();
  });

  it("refuses an own flag with an unknown slug, a missing slot, or Cream where it can't go", () => {
    for (const id of [
      "own-plum-star-cream-ink",
      "own-plum-star-cream-ink-auto-x",
      "own-oxblood-star-cream-ink-auto",
      "own-plum-stars-cream-ink-auto",
      "own-plum-star-cream-maroon-auto",
      "own-cream-star-ink-ink-auto",
      "own-plum-star-ink-cream-auto",
      "own-plum-star-ink-ink-cream",
      "own-plum-star-cream-ink-Auto",
      "own-plum-twin bands-cream-ink-auto",
      "own-",
      "own",
    ]) {
      expect(findAvatar(id), id).toBeUndefined();
      expect(ownDesign(id), id).toBeUndefined();
    }
  });

  it("resolves a school logo by ESPN id, which is what survives a rename", () => {
    const michigan = findLogo("Michigan")!;
    const pennant = findAvatar(teamAvatarId(michigan));
    expect(pennant).toEqual({
      id: `team-${michigan.espnId}`,
      name: "Michigan",
      file: `/${michigan.file}`,
      color: michigan.colors.primary,
      kind: "logo",
    });
  });

  it("uses the 150px mark, never the 32px one sized for the board", () => {
    const pennants = teamAvatarConferences.flatMap((c) => c.teams);
    expect(pennants.filter((p) => p.file.startsWith("/logos/espn/"))).toEqual([]);
    expect(pennants.filter((p) => !existsSync(`public${p.file}`)).map((p) => p.name)).toEqual([]);
  });

  it("offers every school exactly once, grouped by conference", () => {
    const pennants = teamAvatarConferences.flatMap((c) => c.teams);
    expect(pennants).toHaveLength(teamLogos.length);
    expect(new Set(pennants.map((p) => p.id)).size).toBe(teamLogos.length);
  });

  it("resolves a member's photo with no database, to the URL that serves it", () => {
    expect(findAvatar("photo-7-0a1b2c3d")).toEqual({
      id: "photo-7-0a1b2c3d",
      name: "Photo",
      file: "/pennants/7/0a1b2c3d.jpg",
      color: "var(--muted-foreground)",
      kind: "photo",
    });
    expect(photoAvatarId(7, "0a1b2c3d")).toBe("photo-7-0a1b2c3d");
  });

  it("refuses a photo id that is not a member id and an eight-character hash", () => {
    expect(findAvatar("photo")).toBeUndefined();
    expect(findAvatar("photo-7")).toBeUndefined();
    expect(findAvatar("photo-7-0a1b2c3")).toBeUndefined();
    expect(findAvatar("photo-7-0A1B2C3D")).toBeUndefined();
    expect(findAvatar("photo-x-0a1b2c3d")).toBeUndefined();
    expect(findAvatar("photo-0-0a1b2c3d")).toBeUndefined();
    expect(findAvatar("photo-7-0a1b2c3d/../x")).toBeUndefined();
  });

  it("keeps the kinds from colliding", () => {
    expect(avatars.filter((a) => /^(photo|own)/.test(a.id)).map((a) => a.id)).toEqual([]);
    const ids = new Set(avatars.map((a) => a.id));
    expect(teamAvatarConferences.flatMap((c) => c.teams).filter((p) => ids.has(p.id))).toEqual([]);
  });

  it("refuses an id that is neither, including a team prefix with no school behind it", () => {
    expect(findAvatar(null)).toBeUndefined();
    expect(findAvatar("")).toBeUndefined();
    expect(findAvatar("pennants-99")).toBeUndefined();
    expect(findAvatar("team-999999")).toBeUndefined();
    expect(findAvatar("team-")).toBeUndefined();
    expect(findAvatar("team-abc")).toBeUndefined();
  });
});
