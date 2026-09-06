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
  /** 150px mark, relative to `public/`. */
  file: string;
  /** 32px mark keyed by ESPN id, relative to `public/`. */
  small: string;
  /** Present for the 31 Week 1 schools only. */
  colors?: TeamColors;
}

export const teamLogos: readonly TeamLogo[] = logoList;

const bySchool = new Map(teamLogos.map((t) => [t.school, t]));
const bySlug = new Map(teamLogos.map((t) => [t.slug, t]));
const byEspnId = new Map(teamLogos.map((t) => [t.espnId, t]));

/** Matches the slugs in logos.json, so a display name resolves without a lookup table. */
export function slugify(school: string): string {
  return school
    .toLowerCase()
    .replace(/['’()]/g, "")
    .replace(/&/g, "and")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Prefer this when a CFBD `team.id` is on hand: it is the numeric identity. */
export function findLogoByEspnId(espnId: number): TeamLogo | undefined {
  return byEspnId.get(espnId);
}

/** Falls back to the slug so a display name that is not an exact match still resolves. */
export function findLogo(school: string): TeamLogo | undefined {
  return bySchool.get(school) ?? bySlug.get(slugify(school));
}

export function logoSrc(school: string): string | undefined {
  const entry = findLogo(school);
  return entry && `/${entry.file}`;
}

/**
 * Only 31 of the 136 schools carry colors, so the fallback is the common path,
 * not an edge case. Inventing a color would misrepresent a school's brand.
 */
export const FALLBACK_TEAM_COLOR = "var(--border)";

export function teamColor(school: string, which: keyof Omit<TeamColors, "source"> = "primary"): string {
  return findLogo(school)?.colors?.[which] ?? FALLBACK_TEAM_COLOR;
}
