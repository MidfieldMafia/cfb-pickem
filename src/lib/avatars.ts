import avatarList from "../../public/avatars/avatars.json";
import { conferences, findLogoByEspnId, type TeamLogo } from "./logos";

export interface Avatar {
  id: string;
  name: string;
  file: string;
  color: string;
  /**
   * How the mark is drawn in the disc: a flag bleeds past the edge, a school
   * logo sits inside it (#225), a photo fills it bare (#221). See `Pennant`
   * in the design system.
   */
  kind: "flag" | "logo" | "photo";
}

/** The twelve preset pennants. The other kinds are a school logo and a member's photo, below. */
export const avatars: readonly Avatar[] = avatarList.map((a) => ({ ...a, kind: "flag" as const }));

const byId = new Map(avatars.map((a) => [a.id, a]));

/**
 * A school pennant is keyed by ESPN id, not by slug: the id is the school's
 * numeric identity and survives a rename, while a slug is derived from the
 * display name and would strand every member who picked that school the day it
 * rebrands. `members.avatar_id` keeps this string forever, so it has to be the
 * durable one.
 */
const TEAM_PREFIX = "team-";

export function teamAvatarId(team: TeamLogo): string {
  return `${TEAM_PREFIX}${team.espnId}`;
}

/** The 150px `file` mark, never the 32px `small` one — that is sized for the inline board marks. */
function toAvatar(team: TeamLogo): Avatar {
  return {
    id: teamAvatarId(team),
    name: team.school,
    file: `/${team.file}`,
    color: team.colors.primary,
    kind: "logo",
  };
}

export interface AvatarConference {
  name: string;
  teams: readonly Avatar[];
}

/** The 136 school pennants, grouped for the picker's conference drill-down. */
export const teamAvatarConferences: readonly AvatarConference[] = conferences.map((c) => ({
  name: c.name,
  teams: c.teams.map(toAvatar),
}));

/**
 * A member's own photo is `photo-<memberId>-<hash8>`, where `hash8` is the
 * first eight hex characters of the JPEG's SHA-256. The hash is in the id so
 * that a replaced photo is a new URL, which is what lets it be served
 * `immutable`; the member id is there so the id resolves with no database.
 */
const PHOTO_ID = /^photo-([1-9][0-9]*)-([0-9a-f]{8})$/;

export function photoAvatarId(memberId: number, hash8: string): string {
  return `photo-${memberId}-${hash8}`;
}

/** The mark carries no color of its own, and is drawn untinted; this is only for a caller that asks. */
const PHOTO_COLOR = "var(--muted-foreground)";

/** The one resolver, for all three kinds. `undefined` means the member has no pennant yet. */
export function findAvatar(id: string | null | undefined): Avatar | undefined {
  if (!id) return undefined;
  if (id.startsWith(TEAM_PREFIX)) {
    const espnId = Number(id.slice(TEAM_PREFIX.length));
    const team = Number.isInteger(espnId) ? findLogoByEspnId(espnId) : undefined;
    return team && toAvatar(team);
  }
  const photo = PHOTO_ID.exec(id);
  if (photo) {
    const [, memberId, hash8] = photo;
    return { id, name: "Photo", file: `/pennants/${memberId}/${hash8}.jpg`, color: PHOTO_COLOR, kind: "photo" };
  }
  return byId.get(id);
}
