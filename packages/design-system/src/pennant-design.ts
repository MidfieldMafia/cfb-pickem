/**
 * A flag pennant as data: the palette, the patterns, and the one function that
 * draws a design (#398, #427). Every flag in the app goes through it, the
 * fifteen presets and a member's own alike, so a re-tint or a redrawn pattern
 * reaches every flag that uses it.
 *
 * The palette is plain data rather than CSS tokens: its only reader is
 * `pennantSvg`, whose output is a `data:` URI that can't see a custom property.
 *
 * A slug is permanent. A member's own flag stores the slugs in `avatar_id`, so
 * a slug is never renamed or reused, and a color or pattern is never removed
 * while a saved id still uses it. They hold no hyphens, which join them there.
 */

export interface PennantColor {
  slug: string;
  name: string;
  hex: string;
}

/** The fourteen colors a flag, background or pattern may take, in the maker's order. */
export const PENNANT_FLAG_COLORS = [
  { slug: "moss", name: "Moss", hex: "#6A9449" },
  { slug: "sage", name: "Sage", hex: "#5C9A74" },
  { slug: "pine", name: "Pine", hex: "#1F4034" },
  { slug: "teal", name: "Teal", hex: "#1E6F73" },
  { slug: "slate", name: "Slate", hex: "#2B4A5E" },
  { slug: "sky", name: "Sky", hex: "#3F6E96" },
  { slug: "plum", name: "Plum", hex: "#4A2B45" },
  { slug: "maroon", name: "Maroon", hex: "#75222C" },
  { slug: "pink", name: "Pink", hex: "#C8657D" },
  { slug: "copper", name: "Copper", hex: "#D2712E" },
  { slug: "gold", name: "Gold", hex: "#B08D2E" },
  { slug: "tan", name: "Tan", hex: "#9C845F" },
  { slug: "stone", name: "Stone", hex: "#6F6152" },
  { slug: "ink", name: "Ink", hex: "#241F1A" },
] as const satisfies readonly PennantColor[];

/**
 * Cream is a pattern color only. A cream flag, pole or background on the paper
 * disc reads as no pennant at all.
 */
export const PENNANT_MARK_COLORS = [
  ...PENNANT_FLAG_COLORS,
  { slug: "cream", name: "Cream", hex: "#FBF6EC" },
] as const satisfies readonly PennantColor[];

export type PennantFlagColor = (typeof PENNANT_FLAG_COLORS)[number]["slug"];
export type PennantMarkColor = (typeof PENNANT_MARK_COLORS)[number]["slug"];

export type PennantPole = "ink" | "stone" | "tan" | "gold";

/** The four poles. */
export const PENNANT_POLES: readonly (PennantColor & { slug: PennantPole })[] = (
  ["ink", "stone", "tan", "gold"] as const
).map((slug) => ({ ...PENNANT_FLAG_COLORS.find((c) => c.slug === slug)!, slug }));

export interface PennantPattern {
  slug: string;
  name: string;
  /** Drawn over the flag `M16 13 L56 28 L16 43 Z`, in the 64-unit space, even-odd. Empty for Plain. */
  d: string;
}

/** The 18 patterns, one family per row of six: splits, then stripes and chevrons, then marks. */
export const PENNANT_PATTERNS = [
  { slug: "plain", name: "Plain", d: "" },
  { slug: "trim", name: "Trim", d: "M16 13 L56 28 L16 43 Z M20 18.8 L20 37.2 L44.6 28 Z" },
  { slug: "hoist", name: "Hoist", d: "M16 13 L24 16 L24 40 L16 43 Z" },
  { slug: "tip", name: "Tip", d: "M40 23 L54 28 L40 33 Z" },
  { slug: "sash", name: "Sash", d: "M16 28 L56 28 L16 43 Z" },
  { slug: "tricolor", name: "Tricolor", d: "M16 13 L42.7 23 L16 23 Z M16 33 L42.7 33 L16 43 Z" },
  {
    slug: "twinbands",
    name: "Twin Bands",
    d: "M21 14.9 L25 16.4 L25 39.6 L21 41.1 Z M29 17.9 L33 19.4 L33 36.6 L29 38.1 Z",
  },
  { slug: "rails", name: "Rails", d: "M16 24 L45.3 24 L50.7 26 L16 26 Z M16 30 L50.7 30 L45.3 32 L16 32 Z" },
  { slug: "bars", name: "Bars", d: "M16 18 L30 22 L30 26 L16 22 Z M16 34 L30 30 L30 34 L16 38 Z" },
  {
    slug: "cross",
    name: "Cross",
    d: "M25.5 20 L28.5 20 L28.5 26.5 L35 26.5 L35 29.5 L28.5 29.5 L28.5 36 L25.5 36 L25.5 29.5 L19 29.5 L19 26.5 L25.5 26.5 Z",
  },
  { slug: "chevron", name: "Chevron", d: "M24 18 L34 28 L24 38 L20 38 L30 28 L20 18 Z" },
  {
    slug: "chevrons",
    name: "Chevrons",
    d: "M16 13 L26 18 L16 23 Z M16 23 L26 28 L16 33 Z M16 33 L26 38 L16 43 Z",
  },
  { slug: "dot", name: "Dot", d: "M22 28a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z" },
  { slug: "ring", name: "Ring", d: "M22 28a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z M25 28a3 3 0 1 1 6 0a3 3 0 1 1 -6 0Z" },
  {
    slug: "pips",
    name: "Pips",
    d: "M20 28a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z M28 28a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z M36 28a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z",
  },
  { slug: "diamond", name: "Diamond", d: "M28 22 L34 28 L28 34 L22 28 Z" },
  {
    slug: "star",
    name: "Star",
    d: "M29.0 21.5 L30.6 25.8 L35.2 26.0 L31.6 28.8 L32.8 33.3 L29.0 30.7 L25.2 33.3 L26.4 28.8 L22.8 26.0 L27.4 25.8 Z",
  },
  { slug: "block", name: "Block", d: "M30 20 L30 40 L42 34 L42 26 Z" },
] as const satisfies readonly PennantPattern[];

export type PennantPatternSlug = (typeof PENNANT_PATTERNS)[number]["slug"];

/** One flag: the slugs of each of its five settings. `bg: "auto"` tints the disc with the flag color. */
export interface PennantDesign {
  flag: PennantFlagColor;
  pattern: PennantPatternSlug;
  mark: PennantMarkColor;
  pole: PennantPole;
  bg: PennantFlagColor | "auto";
}

/** What the maker opens on the first time: a plain Pine flag on an Ink pole. */
export const BLANK_PENNANT: PennantDesign = { flag: "pine", pattern: "plain", mark: "cream", pole: "ink", bg: "auto" };

export function pennantColor(slug: PennantMarkColor): PennantColor {
  return PENNANT_MARK_COLORS.find((c) => c.slug === slug)!;
}

export function pennantPattern(slug: PennantPatternSlug): PennantPattern {
  return PENNANT_PATTERNS.find((p) => p.slug === slug)!;
}

/** The disc's tint: the background color, or the flag's own when the background is Auto. */
export function pennantTint(design: PennantDesign): string {
  return pennantColor(design.bg === "auto" ? design.flag : design.bg).hex;
}

/**
 * The flag as an SVG document, in the same 64-unit shell the preset files used
 * before #427: an 18% disc, then the pole, flag and pattern scaled 125% about
 * the centre. `Pennant` draws it at 125% again, so it bleeds past the disc edge.
 */
export function pennantSvg(design: PennantDesign): string {
  const pole = pennantColor(design.pole).hex;
  const { d } = pennantPattern(design.pattern);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<circle cx="32" cy="32" r="32" fill="${pennantTint(design)}" opacity=".18"/>` +
    `<g transform="translate(32 32) scale(1.25) translate(-33.5 -31)">` +
    `<rect x="11" y="9" width="5" height="46" rx="2" fill="${pole}"/>` +
    `<circle cx="13.5" cy="9" r="3" fill="${pole}"/>` +
    `<path d="M16 13 L56 28 L16 43 Z" fill="${pennantColor(design.flag).hex}"/>` +
    (d ? `<path d="${d}" fill="${pennantColor(design.mark).hex}" fill-rule="evenodd"/>` : "") +
    `</g></svg>`
  );
}

/** `pennantSvg` as the `file` a `PennantMark` carries. */
export function pennantDataUri(design: PennantDesign): string {
  return `data:image/svg+xml,${encodeURIComponent(pennantSvg(design))}`;
}
