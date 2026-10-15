/**
 * The Game sheet field's end zones and turnover callouts, in team colours: the
 * resolution of "End zones and play labels" (#395), design A.
 *
 * Each end zone fills with its school's primary from `logos.ts`, never the bar
 * pair, and primaries that look like the turf stay. The school's name sits on
 * top in cream or ink, whichever contrasts more. A callout takes the primary of
 * the team that got the ball, the same way.
 *
 * Pure and client-safe. The card measures the names in the browser; this only
 * says which to try and picks the first that fits.
 */
import { findLogo } from "@/lib/logos";
import { contrast } from "./bar-colors";

/** The end zone pine from before (#310), for a school with no `logos.ts` entry, such as an FCS opponent. */
export const END_ZONE = "#173027";
export const CREAM = "#FBF6EC";
export const INK = "#241F1A";
/** How much of the end zone's 112-unit length a name may take. */
export const NAME_ROOM = 100;

/** A school's end zone and callout colour: its primary, or the pine for a school `logos.ts` doesn't have. */
export function teamFill(school: string): string {
  return findLogo(school)?.colors.primary ?? END_ZONE;
}

/** Cream or ink, whichever contrasts more with `fill`. */
export function textOn(fill: string): string {
  return contrast(fill, CREAM) >= contrast(fill, INK) ? CREAM : INK;
}

export interface EndZone {
  fill: string;
  /** The name's colour. */
  ink: string;
  /** What the end zone may say, longest first: the school, its short name, the feed's abbreviation. */
  names: string[];
}

/** One school's end zone. `abbr` is the feed's own abbreviation for it, as the Recent plays card writes it. */
export function endZone(school: string, abbr: string): EndZone {
  const fill = teamFill(school);
  const names = [school, findLogo(school)?.short, abbr].flatMap((name) => (name ? [name.toUpperCase()] : []));
  return { fill, ink: textOn(fill), names: [...new Set(names)] };
}

/** The first name `width` says fits in the end zone, or the last when none does. */
export function fitName(names: readonly string[], width: (name: string) => number, room = NAME_ROOM): string {
  return names.find((name) => width(name) <= room) ?? names.at(-1) ?? "";
}
