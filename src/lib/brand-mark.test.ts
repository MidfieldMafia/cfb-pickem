import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { markSvg } from "./brand-mark";

const copies = {
  "src/app/icon.svg": readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8"),
  "public/brand/mark.svg": readFileSync(new URL("../../public/brand/mark.svg", import.meta.url), "utf8"),
};

/** The shapes a copy draws over its square, with the square itself left out. */
function shapes(svg: string): string[] {
  return [...svg.matchAll(/<(path|rect)\b[^>]*>/g)].map((m) => m[0].replace(/\s*\/?>$/, "")).filter((tag) => !/\brx=|width="64"/.test(tag));
}

/** Pine pixels around whatever is drawn on the square, at 512px. */
async function gaps(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 }).resize(512, 512).raw().toBuffer({ resolveWithObject: true });
  let top = info.height, bottom = -1, left = info.width, right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      // Pine is #1F4034: anything well off it in red is the S or the rule.
      if (data[i] - 0x1f > 40) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return { above: top, below: info.height - 1 - bottom, left, right: info.width - 1 - right };
}

describe("the brand mark", () => {
  it("centres the S and its rule in the square", async () => {
    const g = await gaps(markSvg());
    expect(Math.abs(g.above - g.below)).toBeLessThanOrEqual(8);
    expect(Math.abs(g.left - g.right)).toBeLessThanOrEqual(2);
  });

  it("draws the S as an outline, so no installed font can move it", () => {
    expect(markSvg()).not.toMatch(/<text\b/);
    for (const svg of Object.values(copies)) expect(svg).not.toMatch(/<text\b/);
  });

  it("draws the same shapes in the favicon, the header mark and the PNG icons", () => {
    for (const [file, svg] of Object.entries(copies)) expect({ file, shapes: shapes(svg) }).toEqual({ file, shapes: shapes(markSvg()) });
  });

  it("rounds only the header mark's corners", () => {
    expect(copies["public/brand/mark.svg"]).toMatch(/<rect width="64" height="64" rx="7"/);
    expect(copies["src/app/icon.svg"]).not.toMatch(/\brx=/);
    expect(markSvg()).not.toMatch(/\brx=/);
  });
});
