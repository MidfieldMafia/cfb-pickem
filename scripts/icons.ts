/**
 * Rasterizes the Saturday Slate monogram into the PNG app icons that the web
 * manifest and iOS need — neither will take the SVG. Run it when the mark
 * changes and commit the output:
 *
 *   npm run icons
 *
 * The shapes match public/brand/mark.svg; only the corner radius differs,
 * because both home screens mask the icon themselves and a rounded source
 * would show paper-colored corners inside their mask.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PINE = "#1F4034";
const CREAM = "#FBF6EC";
const RUST = "#A94B17";

/** The monogram, square and full bleed. Chivo when installed, Arial Black otherwise. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${PINE}"/>
  <text x="32" y="38" text-anchor="middle" font-family="Chivo, 'Arial Black', Impact, sans-serif" font-weight="900" font-size="40" fill="${CREAM}">S</text>
  <rect x="19" y="44" width="26" height="5" fill="${RUST}"/>
</svg>`;

const targets = [
  // The two sizes Chrome requires before it will call the app installable.
  { file: "public/icon-192.png", size: 192 },
  { file: "public/icon-512.png", size: 512 },
  // What Next serves as <link rel="apple-touch-icon">, at the size modern
  // iPhones ask for.
  { file: "src/app/apple-icon.png", size: 180 },
];

async function main() {
  const root = new URL("..", import.meta.url);
  for (const { file, size } of targets) {
    const png = await sharp(Buffer.from(MARK), { density: 600 }).resize(size, size).png().toBuffer();
    await writeFile(fileURLToPath(new URL(file, root)), png);
    console.log(`${file} — ${size}×${size}, ${png.length} bytes`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
