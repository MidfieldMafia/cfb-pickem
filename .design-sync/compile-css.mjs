// Compiles the design-system package's Tailwind 4 utilities + tokens into one plain stylesheet
// for design-sync (the package ships no compiled CSS; the app compiles it via Next's PostCSS).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputFile = path.join(root, "packages/design-system/.ds-entry.css");
const outFile = path.join(root, "packages/design-system/.ds-compiled.css");
const input = `@import "tailwindcss";
@import "tw-animate-css";
@source "./src";
@source "../../.design-sync/previews";
@import "./styles.css";
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(inputFile, input);
try {
  const res = await postcss([tailwind()]).process(input, { from: inputFile, to: outFile });
  // The app gets --font-chivo/--font-manrope from next/font on <html>; a design project has no next/font,
  // so load the same Google families remotely and define the two variables ourselves.
  const fonts = '@import url("https://fonts.googleapis.com/css2?family=Chivo:wght@700;900&family=Manrope:wght@400;500;600;700;800&display=swap");\n';
  const vars = '\n:root { --font-chivo: "Chivo"; --font-manrope: "Manrope"; }\n';
  fs.writeFileSync(outFile, fonts + res.css + vars);
  console.log(`compiled ${(res.css.length / 1024).toFixed(1)} KB -> ${path.relative(root, outFile)}`);
} finally {
  fs.rmSync(inputFile, { force: true });
}
