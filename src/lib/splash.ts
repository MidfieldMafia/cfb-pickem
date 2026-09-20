/**
 * The iPhone screens the launch splash is drawn for. iOS picks an
 * `apple-touch-startup-image` by matching the media query exactly, so a
 * screen missing here gets a blank launch. `scripts/splash.ts` renders one
 * PNG per entry and the root layout links them; both read this list.
 *
 * Sizes are CSS points in portrait. Add a row when Apple ships a new size,
 * then run `npm run splash` and commit the images.
 */
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6 Plus, 7 Plus, 8 Plus
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 375, height: 667, ratio: 2 }, // SE (2nd, 3rd gen), 6, 7, 8
] as const;

export type SplashScreen = (typeof SPLASH_SCREENS)[number];

/** Where a screen's image is served from `public/`. */
export function splashUrl({ width, height, ratio }: SplashScreen): string {
  return `/splash/${width * ratio}x${height * ratio}.png`;
}

/** The media query iOS matches a launch image against. */
export function splashMedia({ width, height, ratio }: SplashScreen): string {
  return `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
}
