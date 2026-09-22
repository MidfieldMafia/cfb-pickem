import logoList from "./logos.json";

export interface TeamColors {
  primary: string;
  secondary: string;
  /**
   * Provenance of the pair. "brand guide (unverified)" means it was read off a
   * school brand guide rather than confirmed against teamcolorcodes.com, so it
   * may be off. Treat it as real but not authoritative.
   */
  source: string;
}

export interface TeamLogo {
  school: string;
  slug: string;
  /** CFBD `team.id` — the numeric identity, when one is on hand. */
  espnId: number;
  /**
   * The conference the school plays in. Maintained by hand through
   * realignment — the file is also *ordered* by conference, but nothing reads
   * that order for membership.
   */
  conference: string;
  /** 150px mark, relative to `public/`. */
  file: string;
  /** 32px mark keyed by ESPN id, relative to `public/`. */
  small: string;
  colors: TeamColors;
}

export const teamLogos: readonly TeamLogo[] = logoList;

const bySlug = new Map(teamLogos.map((t) => [t.slug, t]));
const byEspnId = new Map(teamLogos.map((t) => [t.espnId, t]));

export interface Conference {
  name: string;
  teams: readonly TeamLogo[];
}

/**
 * The schools grouped by conference, for anything that browses all 136 rather
 * than resolving one. Conferences come out in the order they first appear in
 * the file, which is the order they are listed in; membership comes from each
 * entry's `conference`, so a school filed out of order still lands correctly.
 */
export const conferences: readonly Conference[] = (() => {
  const grouped = new Map<string, TeamLogo[]>();
  for (const team of teamLogos) {
    const existing = grouped.get(team.conference);
    if (existing) existing.push(team);
    else grouped.set(team.conference, [team]);
  }
  return [...grouped].map(([name, teams]) => ({ name, teams }));
})();

/** Matches the slugs in logos.json, so a display name resolves without a lookup table. */
function slugify(school: string): string {
  return school
    .toLowerCase()
    .replace(/['’()]/g, "")
    .replace(/&/g, "and")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * CFBD's `/games` feed names a team differently than `Team.school` (and so
 * differently than this file's slugs) for these schools. Slugifying the feed
 * name straight through misses the asset even though it exists.
 */
const SLUG_ALIASES: Record<string, string> = {
  "florida-international": "fiu",
  "app-state": "appalachian-state",
  "massachusetts": "umass",
};

/** Prefer this when a CFBD `team.id` is on hand: it is the numeric identity. */
export function findLogoByEspnId(espnId: number): TeamLogo | undefined {
  return byEspnId.get(espnId);
}

/**
 * By slug, so a display name resolves whatever its punctuation or casing. Every
 * entry's slug is `slugify(school)`, which is why an exact-name index would
 * only ever answer what this already answers.
 */
export function findLogo(school: string): TeamLogo | undefined {
  const slug = slugify(school);
  return bySlug.get(SLUG_ALIASES[slug] ?? slug);
}

export function logoSrc(school: string): string | undefined {
  const entry = findLogo(school);
  return entry && `/${entry.file}`;
}

/**
 * For a school that is not in the index at all — every school that is carries
 * a pair. Inventing a color would misrepresent a school's brand.
 */
export const FALLBACK_TEAM_COLOR = "var(--border)";

export function teamColor(school: string, which: "primary" | "secondary" = "primary"): string {
  return findLogo(school)?.colors[which] ?? FALLBACK_TEAM_COLOR;
}
