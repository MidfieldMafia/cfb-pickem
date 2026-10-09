/**
 * The drawing itself, imported from the package source rather than
 * `@saturday-slate/design-system`: the app resolves that to `dist/`, which only
 * a package build refreshes, and a stale `dist/` would test the last build.
 */
import { describe, expect, it } from "vitest";
import {
  PENNANT_FLAG_COLORS,
  PENNANT_MARK_COLORS,
  PENNANT_PATTERNS,
  PENNANT_POLES,
  pennantDataUri,
  pennantSvg,
  pennantTint,
  type PennantDesign,
} from "../../packages/design-system/src/pennant-design";

const PLUM_STAR: PennantDesign = { flag: "plum", pattern: "star", patternColor: "cream", pole: "ink", bg: "auto" };

describe("the pennant palette", () => {
  it("offers fourteen flag colors in the spec's order, and never Cream", () => {
    expect(PENNANT_FLAG_COLORS.map((c) => c.name)).toEqual([
      "Moss", "Sage", "Pine", "Teal", "Slate", "Sky", "Plum",
      "Maroon", "Pink", "Copper", "Gold", "Tan", "Stone", "Ink",
    ]);
  });

  it("adds Cream for the pattern color only", () => {
    expect(PENNANT_MARK_COLORS.map((c) => c.slug)).toEqual([...PENNANT_FLAG_COLORS.map((c) => c.slug), "cream"]);
    expect(PENNANT_POLES.map((c) => c.slug)).toEqual(["ink", "stone", "tan", "gold"]);
  });

  it("keeps the 18 patterns in their three rows of six", () => {
    expect(PENNANT_PATTERNS.map((p) => p.name)).toEqual([
      "Plain", "Trim", "Hoist", "Tip", "Sash", "Tricolor",
      "Twin Bands", "Rails", "Bars", "Cross", "Chevron", "Chevrons",
      "Dot", "Ring", "Pips", "Diamond", "Star", "Block",
    ]);
  });

  it("uses hyphen-free lowercase slugs, because an own flag's id joins them with hyphens", () => {
    const slugs = [...PENNANT_MARK_COLORS, ...PENNANT_PATTERNS].map((x) => x.slug);
    expect(slugs.filter((s) => !/^[a-z]+$/.test(s))).toEqual([]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("pennantSvg", () => {
  it("draws today's 64-unit shell: an 18% disc, then pole, flag and pattern at 125%", () => {
    const svg = pennantSvg(PLUM_STAR);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64"/);
    expect(svg).toContain('<circle cx="32" cy="32" r="32" fill="#4A2B45" opacity="0.18"/>');
    expect(svg).toContain('<g transform="translate(32 32) scale(1.25) translate(-33.5 -31)">');
    expect(svg).toContain('<rect x="11" y="9" width="5" height="46" rx="2" fill="#241F1A"/>');
    expect(svg).toContain('<path d="M16 13 L56 28 L16 43 Z" fill="#4A2B45"/>');
    expect(svg).toMatch(/<path d="M29.0 21.5 [^"]+" fill="#FBF6EC" fill-rule="evenodd"\/>/);
  });

  it("tints the disc with the background color when one is chosen", () => {
    const svg = pennantSvg({ ...PLUM_STAR, bg: "gold" });
    expect(svg).toContain('fill="#B08D2E" opacity="0.18"');
    expect(pennantTint({ ...PLUM_STAR, bg: "gold" })).toBe("#B08D2E");
    expect(pennantTint(PLUM_STAR)).toBe("#4A2B45");
  });

  it("draws no pattern path for Plain", () => {
    expect(pennantSvg({ ...PLUM_STAR, pattern: "plain" }).match(/<path/g)).toHaveLength(1);
  });

  it("carries the redraws: dot centred at 28, sash the bottom half, chevrons spanning 13 to 43", () => {
    expect(pennantSvg({ ...PLUM_STAR, pattern: "dot" })).toContain('d="M22 28a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z"');
    expect(pennantSvg({ ...PLUM_STAR, pattern: "sash" })).toContain('d="M16 28 L56 28 L16 43 Z"');
    const chevrons = pennantSvg({ ...PLUM_STAR, pattern: "chevrons" });
    expect(chevrons).toContain("M16 13 L26 18");
    expect(chevrons).toContain("L16 43 Z");
  });

  it("encodes as a data URI an <img> can load", () => {
    const uri = pennantDataUri(PLUM_STAR);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).not.toContain("#");
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(pennantSvg(PLUM_STAR));
  });
});
