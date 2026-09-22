import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { avatars, findAvatar, photoAvatarId, teamAvatarConferences, teamAvatarId } from "./avatars";
import { findLogo, teamLogos } from "./logos";

describe("pennants", () => {
  it("resolves one of the twelve flags", () => {
    const flag = avatars[0];
    expect(findAvatar(flag.id)).toEqual(flag);
    expect(flag.kind).toBe("flag");
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

  it("keeps the three kinds from colliding", () => {
    expect(avatars.filter((a) => a.id.startsWith("photo")).map((a) => a.id)).toEqual([]);
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
