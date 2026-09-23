import { describe, expect, it } from "vitest";
import { clampCrop, cropBox, FIT, MAX_ZOOM, sourceSquare } from "./crop";

const portrait = { width: 3024, height: 4032 };
const landscape = { width: 1600, height: 900 };

/** Every field within floating-point noise of what was expected. */
function expectNear(actual: Record<string, number>, expected: Record<string, number>) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) expect(actual[key]).toBeCloseTo(expected[key], 9);
}

describe("the photo crop", () => {
  it("starts with the short side filling the ring, centred", () => {
    expect(cropBox(portrait, FIT)).toEqual({ left: 0, top: -(4 / 3 - 1) / 2, width: 1, height: 4 / 3 });
    expectNear(sourceSquare(portrait, FIT), { x: 0, y: 504, side: 3024 });
  });

  it("never lets the photo pull away from the ring's edge", () => {
    expect(clampCrop(landscape, { zoom: 1, x: 5, y: 5 })).toEqual({ zoom: 1, x: (16 / 9 - 1) / 2, y: 0 });
    expect(clampCrop(landscape, { zoom: 1, x: -5, y: -5 })).toEqual({ zoom: 1, x: -(16 / 9 - 1) / 2, y: 0 });
  });

  it("keeps zoom between the fit and four times it", () => {
    expect(clampCrop(portrait, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(1);
    expect(clampCrop(portrait, { zoom: 9, x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it("pulls an offset back in when zooming out shrinks the room for it", () => {
    const zoomedIn = clampCrop(portrait, { zoom: 2, x: 0.5, y: 0 });
    expect(zoomedIn.x).toBe(0.5);
    expect(clampCrop(portrait, { ...zoomedIn, zoom: 1 }).x).toBe(0);
  });

  it("takes the square the ring covers out of the source", () => {
    // Twice the fit on a 1600×900: the ring covers 450 source pixels.
    // Moving the photo right by a quarter ring shows source further left.
    const crop = clampCrop(landscape, { zoom: 2, x: 0.25, y: 0 });
    expectNear(sourceSquare(landscape, crop), { x: 800 - 225 - 112.5, y: 450 - 225, side: 450 });
  });

  it("agrees with what the ring shows", () => {
    const crop = clampCrop(landscape, { zoom: 1.5, x: -0.2, y: 0.1 });
    const box = cropBox(landscape, crop);
    const square = sourceSquare(landscape, crop);
    const perUnit = landscape.width / box.width;
    expect(square.x).toBeCloseTo(-box.left * perUnit);
    expect(square.y).toBeCloseTo(-box.top * perUnit);
    expect(square.side).toBeCloseTo(perUnit);
  });
});
