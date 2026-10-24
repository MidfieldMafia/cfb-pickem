/**
 * Rasterizes the Saturday Slate monogram into the PNG app icons that the web
 * manifest and iOS need — neither will take the SVG. Run it when the mark
 * changes and commit the output:
 *
 *   npm run icons
 *
 * The mark is src/lib/brand-mark.ts's, the same shapes as public/brand/mark.svg;
 * only the corner radius differs, because both home screens mask the icon
 * themselves and a rounded source would show paper-colored corners inside
 * their mask.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { markSvg } from "../src/lib/brand-mark";

const MARK = markSvg();

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
