import avatarList from "../../public/avatars/avatars.json";
import { conferences, findLogoByEspnId, type TeamLogo } from "./logos";

export interface Avatar {
  id: string;
  name: string;
  file: string;
  color: string;
  /**
   * How the mark is drawn in the disc: a flag bleeds past the edge, a school
   * logo sits inside it. Settled in #225 — see `Pennant` in the design system.
   */
  kind: "flag" | "logo";
}

/** The twelve preset pennants. The other kind is a school logo, below. */
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

/** The one resolver, for both kinds. `undefined` means the member has no pennant yet. */
export function findAvatar(id: string | null | undefined): Avatar | undefined {
  if (!id) return undefined;
  if (id.startsWith(TEAM_PREFIX)) {
    const espnId = Number(id.slice(TEAM_PREFIX.length));
    const team = Number.isInteger(espnId) ? findLogoByEspnId(espnId) : undefined;
    return team && toAvatar(team);
  }
  return byId.get(id);
}
