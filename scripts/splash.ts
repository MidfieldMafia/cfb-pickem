/**
 * Renders the iOS launch screen — the brand mark and name centered on paper —
 * once per iPhone size in src/lib/splash.ts. iOS shows it while a Home Screen
 * launch loads, and a static image is all it will take. Run it when the mark
 * or the size list changes and commit the output:
 *
 *   npm run splash
 *
 * The launch screen is one theme, paper, because a dark variant would need a
 * second copy of every media query. Type is Chivo when installed and Arial
 * Black otherwise, the same fallback as scripts/icons.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SPLASH_SCREENS, splashUrl, type SplashScreen } from "../src/lib/splash";

const PAPER = "#F7F1E3";
const PINE = "#1F4034";
const CREAM = "#FBF6EC";
const RUST = "#A94B17";
const FONT = "Chivo, 'Arial Black', Impact, sans-serif";

/** Drawn in CSS points, then scaled to the device's pixels by the viewBox. */
function splashSvg({ width, height, ratio }: SplashScreen): string {
  const tile = 96;
  const cx = width / 2;
  // Optically centered: the block sits a touch above the middle, where the eye puts it.
  const top = height * 0.44 - 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * ratio}" height="${height * ratio}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <g transform="translate(${cx - tile / 2} ${top})">
    <rect width="${tile}" height="${tile}" rx="11" fill="${PINE}"/>
    <text x="${tile / 2}" y="${tile * 0.594}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${tile * 0.625}" fill="${CREAM}">S</text>
    <rect x="${tile * 0.297}" y="${tile * 0.6875}" width="${tile * 0.406}" height="${tile * 0.078}" fill="${RUST}"/>
  </g>
  <text x="${cx}" y="${top + tile + 38}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="24" letter-spacing="1" fill="${PINE}">SATURDAY SLATE</text>
  <rect x="${cx - 60}" y="${top + tile + 50}" width="120" height="4" fill="${RUST}"/>
</svg>`;
}

async function main() {
  const root = new URL("..", import.meta.url);
  await mkdir(fileURLToPath(new URL("public/splash", root)), { recursive: true });
  for (const screen of SPLASH_SCREENS) {
    const png = await sharp(Buffer.from(splashSvg(screen))).png().toBuffer();
    const url = splashUrl(screen);
    await writeFile(fileURLToPath(new URL(`public${url}`, root)), png);
    console.log(`public${url} — ${png.length} bytes`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
