/**
 * The geometry of the photo crop (#231): a photo panned and zoomed behind a
 * circular ring, and the square of the source the ring covers.
 *
 * Everything is measured in ring diameters, so the same numbers draw the
 * crop screen at any width and the small previews beside it. The screen
 * turns a drag into ring diameters; this module never sees a pixel of screen.
 */

export interface ImageSize {
  width: number;
  height: number;
}

export interface Crop {
  /** 1 is the fit: the photo's short side exactly spans the ring. */
  zoom: number;
  /** Where the photo's centre sits from the ring's centre, in ring diameters. */
  x: number;
  y: number;
}

export const FIT: Crop = { zoom: 1, x: 0, y: 0 };

export const MAX_ZOOM = 4;

/** The photo's size in ring diameters at this zoom. */
function scaled(image: ImageSize, zoom: number): ImageSize {
  const short = Math.min(image.width, image.height);
  return { width: (zoom * image.width) / short, height: (zoom * image.height) / short };
}

/**
 * The crop pulled back into bounds: zoom between the fit and `MAX_ZOOM`, and
 * the photo never moved so far that the ring shows past its edge.
 */
export function clampCrop(image: ImageSize, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const size = scaled(image, zoom);
  // `+ 0` turns the -0 that clamping to a zero-width room gives back into 0.
  const within = (value: number, room: number) => Math.min(room, Math.max(-room, value)) + 0;
  return {
    zoom,
    x: within(crop.x, (size.width - 1) / 2),
    y: within(crop.y, (size.height - 1) / 2),
  };
}

/** Where to draw the photo relative to the ring's top-left corner, in ring diameters. */
export function cropBox(image: ImageSize, crop: Crop): { left: number; top: number; width: number; height: number } {
  const size = scaled(image, crop.zoom);
  return {
    left: 0.5 + crop.x - size.width / 2,
    top: 0.5 + crop.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** The square of the source image, in its own pixels, that the ring covers. */
export function sourceSquare(image: ImageSize, crop: Crop): { x: number; y: number; side: number } {
  const box = cropBox(image, crop);
  const perDiameter = image.width / box.width;
  return { x: -box.left * perDiameter, y: -box.top * perDiameter, side: perDiameter };
}
