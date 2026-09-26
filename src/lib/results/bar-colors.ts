/**
 * The two colours of the final sheet's team-stat bars, chosen as a pair from
 * each school's colours in `logos.ts`, by the rule drawn on the Game sheet's
 * design ticket (#265):
 *
 * - A colour counts only if it reaches 3:1 against the card, `#FBF6EC`.
 * - Primaries first, and the away team may take its secondary so the home
 *   team keeps its primary: whatever pair avoids a fallback wins.
 * - Two colours too alike to tell apart are not a pair.
 * - Failing all that, the side that gives way is black, or light gray beside
 *   a bar that is itself dark.
 *
 * Pure and client-safe: worked out whenever a box score is read, never stored,
 * so tuning `TOO_ALIKE` or `DARK` changes every sheet at once.
 */
import type { TeamColors } from "@/lib/logos";

/** The card the bars sit on. */
export const CARD = "#FBF6EC";
/** WCAG's contrast floor for graphics. */
export const MIN_CONTRAST = 3;
export const BLACK = "#000000";
/** For the side that gives way beside a dark bar, where black would read as the same bar. */
export const LIGHT_GRAY = "#B8B4AD";

/**
 * Below this CIEDE2000 difference two colours are "too alike" to share a
 * split bar. Tuned by eye on every school pair in `logos.ts` (#309): at 20,
 * the pairs that still clashed were dark on dark, black by a navy (Southern
 * Miss at BYU, 22), navy by green, black by Tennessee's gray (26), and 26
 * clears them. What it costs is bright pairs in the low 20s, orange by red,
 * which then take a gray or a secondary and still read apart. Ohio State's
 * red and Georgia's are 10 apart, Texas orange and Ohio State red 16.
 */
export const TOO_ALIKE = 26;

/**
 * Below this CIEDE2000 difference from black a bar is "dark", so the side
 * that gives way beside it takes light gray rather than black. Its own number
 * because black reads as one bar with colours well past `TOO_ALIKE`: navies,
 * dark greens, maroons, garnet and dark purples all sit 15 to 31 from black
 * (Michigan navy 19, Florida State garnet 30, Pittsburgh navy 31), and the
 * first that read clearly apart are mid greens and blues at 35. Light gray
 * reads apart from any of them, so erring dark costs nothing. Georgia red
 * is 39.
 */
export const DARK = 33;

export interface BarColors {
  away: string;
  home: string;
}

/**
 * The pair for one game. A school missing from `logos.ts` (an FCS opponent)
 * is `undefined` and has no usable colour, so its side takes the fallback.
 */
export function barColors(away: TeamColors | undefined, home: TeamColors | undefined): BarColors {
  const awayUsable = usable(away);
  const homeUsable = usable(home);
  // Home's choice is the outer loop, so every away option is tried before home gives up its primary.
  for (const h of homeUsable) {
    for (const a of awayUsable) {
      if (!tooAlike(a, h)) return { away: a, home: h };
    }
  }
  // No pair without a fallback. The home side keeps its best colour if it has
  // one, which is also what happens when the two schools' colours all clash.
  if (homeUsable.length > 0) return { away: fallbackBeside(homeUsable[0]), home: homeUsable[0] };
  if (awayUsable.length > 0) return { away: awayUsable[0], home: fallbackBeside(awayUsable[0]) };
  return { away: LIGHT_GRAY, home: BLACK };
}

/** A school's colours that reach 3:1 on the card, primary first. */
function usable(colors: TeamColors | undefined): string[] {
  if (!colors) return [];
  return [colors.primary, colors.secondary].filter((c) => contrast(c, CARD) >= MIN_CONTRAST);
}

function fallbackBeside(other: string): string {
  return deltaE2000(other, BLACK) < DARK ? LIGHT_GRAY : BLACK;
}

export function tooAlike(a: string, b: string): boolean {
  return deltaE2000(a, b) < TOO_ALIKE;
}

function channels(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** sRGB to linear light. */
function linear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE L*a*b* under D65. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear);
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * CIEDE2000, the colour difference that tracks what an eye sees: the older
 * straight-line distance in Lab calls two near-identical reds further apart
 * than Texas orange and Ohio State red.
 */
export function deltaE2000(x: string, y: string): number {
  return ciede2000(lab(x), lab(y));
}

/** CIEDE2000 on L*a*b* values, as Sharma, Wu and Dalal (2005) give it and test it. */
export function ciede2000([L1, a1, b1]: readonly number[], [L2, a2, b2]: readonly number[]): number {
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + g);
  const a2p = a2 * (1 + g);
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const chromatic = c1p * c2p !== 0;

  let dh = chromatic ? h2p - h1p : 0;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = c2p - c1p;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dh / 2));

  const lBar = (L1 + L2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (chromatic) {
    if (Math.abs(h1p - h2p) > 180) hBar += hBar < 360 ? 360 : -360;
    hBar /= 2;
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63));
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}
