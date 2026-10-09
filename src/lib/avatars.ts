import {
  PENNANT_FLAG_COLORS,
  PENNANT_MARK_COLORS,
  PENNANT_PATTERNS,
  PENNANT_POLES,
  pennantColor,
  pennantDataUri,
  pennantPattern,
  pennantTint,
  type PennantDesign,
} from "@saturday-slate/design-system";
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

function flagAvatar(id: string, name: string, design: PennantDesign): Avatar {
  return { id, name, file: pennantDataUri(design), color: pennantTint(design), kind: "flag" };
}

const FLAG_SLUGS = new Set<string>(PENNANT_FLAG_COLORS.map((c) => c.slug));
const MARK_SLUGS = new Set<string>(PENNANT_MARK_COLORS.map((c) => c.slug));
const POLE_SLUGS = new Set<string>(PENNANT_POLES.map((c) => c.slug));
const PATTERN_SLUGS = new Set<string>(PENNANT_PATTERNS.map((p) => p.slug));

/**
 * A design from its five slugs, the order an own flag's id spells them in.
 * Only a known slug in each slot: Cream is a pattern color only, and the poles
 * are the maker's four.
 */
function parseDesign(slots: readonly string[]): PennantDesign | undefined {
  if (slots.length !== 5) return undefined;
  const [flag, pattern, mark, pole, bg] = slots;
  const valid =
    FLAG_SLUGS.has(flag) &&
    PATTERN_SLUGS.has(pattern) &&
    MARK_SLUGS.has(mark) &&
    POLE_SLUGS.has(pole) &&
    (bg === "auto" || FLAG_SLUGS.has(bg));
  return valid ? ({ flag, pattern, mark, pole, bg } as PennantDesign) : undefined;
}

/**
 * The fifteen preset flags, in the order the picker shows them: most likely
 * first, and no flag color beside itself (#398). Every one is a fixed design on
 * an Auto background, drawn by `pennantSvg` like a member's own.
 *
 * An id is permanent, so a saved one keeps its number however the list is
 * reordered. 01–03, 05 (Oxblood Bars) and 08–12 were retired and are never
 * reused: they resolve to nothing, and their member sees their initial.
 */
const PRESETS: readonly [id: string, name: string, flag: string, pattern: string, mark: string, pole: string][] = [
  ["pennants-04", "Moss Dot", "moss", "dot", "ink", "ink"],
  ["pennants-17", "Slate Cross", "slate", "cross", "cream", "tan"],
  ["pennants-07", "Ink Block", "ink", "block", "tan", "tan"],
  ["pennants-16", "Pine Sash", "pine", "sash", "cream", "ink"],
  ["pennants-06", "Maroon Chevrons", "maroon", "chevrons", "cream", "ink"],
  ["pennants-14", "Copper Tip", "copper", "tip", "cream", "ink"],
  ["pennants-22", "Sky Star", "sky", "star", "cream", "ink"],
  ["pennants-19", "Teal Rails", "teal", "rails", "cream", "ink"],
  ["pennants-15", "Gold Diamond", "gold", "diamond", "cream", "ink"],
  ["pennants-21", "Pink Bars", "pink", "bars", "cream", "ink"],
  ["pennants-23", "Ink Twin Bands", "ink", "twinbands", "gold", "ink"],
  ["pennants-13", "Sage Twin Bands", "sage", "twinbands", "pine", "stone"],
  ["pennants-20", "Plum Chevron", "plum", "chevron", "cream", "tan"],
  ["pennants-18", "Stone Pips", "stone", "pips", "cream", "ink"],
  ["pennants-24", "Moss Trim", "moss", "trim", "pine", "stone"],
];

/** The preset flags. The other kinds are a member's own flag, a school logo and a member's photo, below. */
export const avatars: readonly Avatar[] = PRESETS.map(([id, name, ...slots]) => {
  const design = parseDesign([...slots, "auto"]);
  if (!design) throw new Error(`Preset ${id} names a color or pattern the palette lacks.`);
  return flagAvatar(id, name, design);
});

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
/**
 * What `avatarId` says when the welcome form also carries a new photo in its
 * `photo` field. It is not an id anything resolves: the server swaps it for
 * `photo-<memberId>-<hash8>` when it stores the photo. No flag id is `photo`.
 */
export const NEW_PHOTO = "photo";

const PHOTO_ID = /^photo-([1-9][0-9]*)-([0-9a-f]{8})$/;

export function photoAvatarId(memberId: number, hash8: string): string {
  return `photo-${memberId}-${hash8}`;
}

/** The mark carries no color of its own, and is drawn untinted; this is only for a caller that asks. */
const PHOTO_COLOR = "var(--muted-foreground)";

/**
 * A member's own flag is `own-<flag>-<pattern>-<patterncolor>-<pole>-<bg>`, the
 * five slugs of its design, so it resolves with no database (#427). It is never
 * snapped to a preset it happens to match, and it lasts only while it is the
 * member's pennant: nothing else remembers the design.
 */
const OWN_PREFIX = "own-";

export function ownAvatarId(design: PennantDesign): string {
  return OWN_PREFIX + [design.flag, design.pattern, design.mark, design.pole, design.bg].join("-");
}

/** The design an `own-…` id spells, or `undefined` for any other id, or one that doesn't parse. */
export function ownDesign(id: string | null | undefined): PennantDesign | undefined {
  return id?.startsWith(OWN_PREFIX) ? parseDesign(id.slice(OWN_PREFIX.length).split("-")) : undefined;
}

/** "Plum Star": named the way the presets are, for the image `alt`. */
function ownName(design: PennantDesign): string {
  return `${pennantColor(design.flag).name} ${pennantPattern(design.pattern).name}`;
}

/** The one resolver, for every kind. `undefined` means the member has no pennant yet. */
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
  const own = ownDesign(id);
  if (own) return flagAvatar(id, ownName(own), own);
  return byId.get(id);
}
