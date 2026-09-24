// Builds the Artifact design system's `components/bundle.js`, `bundle.css`, `index.d.ts` and each
// `<Name>/README.md` from packages/design-system, into .design-artifact/out/project/components/
// (gitignored).
//
//   node .design-artifact/build.mjs [--scan <dir>]...
//
// Run `npm run build --workspace @saturday-slate/design-system` first: the bundle is the package's
// own dist/, not its source. `--scan` adds a directory whose files use utility classes the
// package itself does not (the Artifact's preview.html copies), so the stylesheet carries them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pkg = path.join(root, "packages/design-system");
const entry = path.join(pkg, "dist/index.js");
const outDir = path.join(here, "out/project/components");
const NAMESPACE = "SaturdaySlateDesignSystem";

const args = process.argv.slice(2);
const scan = args.flatMap((a, i) => (a === "--scan" ? [path.resolve(args[i + 1])] : []));

if (!fs.existsSync(entry)) {
  console.error(`${path.relative(root, entry)} is missing: run \`npm run build --workspace @saturday-slate/design-system\` first.`);
  process.exit(1);
}

// The Artifact's page loads React 18 as window.React / window.ReactDOM (components/lib/). Every
// import of React, the package's and its dependencies' alike, resolves to those globals, and the
// automatic JSX runtime is shimmed over createElement, which React 18's UMD build lacks.
const reactGlobals = {
  name: "react-globals",
  setup(build) {
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: a.path, namespace: "react-global" }));
    build.onLoad({ filter: /.*/, namespace: "react-global" }, (a) => {
      if (a.path === "react/jsx-runtime" || a.path === "react/jsx-dev-runtime") {
        return {
          loader: "js",
          contents: `var R = window.React;
function jsx(type, props, key) { return R.createElement(type, key === undefined ? props : Object.assign({}, props, { key: key })); }
module.exports = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };`,
        };
      }
      if (a.path === "react") return { loader: "js", contents: "module.exports = window.React;" };
      if (a.path === "react-dom" || a.path === "react-dom/client") return { loader: "js", contents: "module.exports = window.ReactDOM;" };
      return { errors: [{ text: `no browser global for "${a.path}"` }] };
    });
  },
};

const shared = {
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: "browser",
  target: "es2020",
  // next/image and next/link read the Next runtime, which the Artifact's page does not have.
  alias: {
    "next/image": path.join(here, "shims/next-image.tsx"),
    "next/link": path.join(here, "shims/next-link.tsx"),
  },
  loader: { ".svg": "dataurl", ".png": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [reactGlobals],
  // Every client component carries "use client"; bundled, the directive means nothing.
  logOverride: { "module-level-directive": "silent" },
  logLevel: "warning",
};

// Pass 1 reads the entry's export names, which the bundle header lists.
const probe = await esbuild.build({ ...shared, format: "esm", metafile: true, minify: false });
const exports = Object.values(probe.metafile.outputs)[0].exports;
// PascalCase only: SCREAMING_CASE exports (CAPS_LABEL, HEADER_TOP) are class-string constants.
const components = exports.filter((n) => /^[A-Z][a-z]/.test(n)).sort();

const iife = await esbuild.build({
  ...shared,
  format: "iife",
  globalName: NAMESPACE,
  minify: true,
  footer: { js: `window.${NAMESPACE} = ${NAMESPACE};` },
});
const body = iife.outputFiles[0].text;
const header = { format: 4, namespace: NAMESPACE, components: components.map((name) => ({ name })) };
const js = `/* @ds-bundle: ${JSON.stringify(header)} */\n${body}`;

// The page inlines the bundle into a <script>; either of these would end or corrupt it.
for (const bad of ["</script", "<!--"]) {
  if (js.toLowerCase().includes(bad)) {
    console.error(`bundle.js contains "${bad}", which the Artifact page cannot inline. Find it in the output and escape it.`);
    process.exit(1);
  }
}

// source(none): without it Tailwind also scans the whole repo from the cwd and ships the app's
// own utilities. The package's source, plus whatever --scan names, is the whole vocabulary.
const input = [
  `@import "tailwindcss" source(none);`,
  `@import "tw-animate-css";`,
  `@source "./src";`,
  ...scan.map((d) => `@source "${path.relative(pkg, d).replaceAll("\\", "/")}";`),
  `@import "./styles.css";`,
].join("\n");
const css = await postcss([tailwind()]).process(input, { from: path.join(pkg, ".artifact-entry.css") });
// The app sets --font-chivo / --font-manrope on <html> through next/font. The page has no
// next/font, so load the same Google families and define the two variables here.
const fonts = '@import url("https://fonts.googleapis.com/css2?family=Chivo:wght@700;900&family=Manrope:wght@400;500;600;700;800&display=swap");\n';
const vars = '\n:root { --font-chivo: "Chivo"; --font-manrope: "Manrope"; }\n';

// The page writes each component's api/ card from components/index.d.ts (its props) and
// components/<Name>/README.md (its description), so both come from the package's own dist/:
// its declarations, and the JSDoc on each component.
const dist = path.join(pkg, "dist");
const modules = [...fs.readFileSync(path.join(dist, "index.d.ts"), "utf8").matchAll(/from '\.\/(.+?)\.js'/g)].map((m) => m[1]);
const imports = new Set();
const bodies = [];
const readmes = {};
for (const mod of modules) {
  const text = fs.readFileSync(path.join(dist, `${mod}.d.ts`), "utf8");
  const body = [];
  for (const line of text.split("\n")) {
    if (/^import .* from '\.\/.+';$/.test(line) || /^import '.+';$/.test(line)) continue;
    if (/^import .* from '.+';$/.test(line)) imports.add(line);
    else body.push(line);
  }
  bodies.push(`// ── ${mod}.d.ts ──\n${body.join("\n").trim()}`);

  const sf = ts.createSourceFile(mod, text, ts.ScriptTarget.Latest, true);
  const named = (s) => (s.name ? [s.name.text] : ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.text) : []);
  const doc = (s) => {
    const all = ts.getJSDocCommentsAndTags(s);
    return all.length ? (ts.getTextOfJSDocComment(all[all.length - 1].comment) ?? "").trim() : "";
  };
  // `xVariants` is a class-variance-authority function; its one parameter lists every variant.
  const variants = {};
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (!d.name.text.endsWith("Variants") || !d.type) continue;
      const lit = (function find(n) {
        return ts.isTypeLiteralNode(n) ? n : ts.forEachChild(n, find);
      })(d.type);
      variants[d.name.text] = lit.members.map((m) => `\`${m.name.getText(sf)}\`: ${m.type.getText(sf).replace(/ \| null \| undefined$/, "")}`);
    }
  }
  const here = sf.statements.flatMap((s) => named(s).filter((n) => components.includes(n)).map((n) => [n, s]));
  const rootName = mod.replace(/(^|-)(\w)/g, (_, _d, c) => c.toUpperCase());
  // A sibling with no JSDoc of its own is a part of the root (CardTitle of Card); one with its own
  // (PennantGroup beside Pennant) is a component in its own right.
  const partNames = here.filter(([n, s]) => n !== rootName && !doc(s)).map(([n]) => n);
  for (const [name, s] of here) {
    const parts = [];
    const d = doc(s);
    if (d) parts.push(d);
    else if (name === rootName && partNames.length) parts.push(`\`${name}\` and its parts.`);
    const uses = [...s.getText(sf).matchAll(/typeof (\w+Variants)/g)].map((m) => m[1]);
    for (const v of uses) if (variants[v]) parts.push(`Variants:\n\n${variants[v].map((l) => `- ${l}`).join("\n")}`);
    if (name === rootName && partNames.length) parts.push(`Parts: ${partNames.map((n) => `\`${n}\``).join(", ")}.`);
    if (parts.length) readmes[name] = `# ${name}\n\n${parts.join("\n\n")}\n`;
  }
}
const dts = `// Generated by .design-artifact/build.mjs from packages/design-system/dist; documentation, never type-checked.\n${[...imports].join("\n")}\n\n${bodies.join("\n\n")}\n`;
const parsed = ts.createSourceFile("index.d.ts", dts, ts.ScriptTarget.Latest, true);
if (parsed.parseDiagnostics.length) {
  console.error(`components/index.d.ts does not parse: ${parsed.parseDiagnostics[0].messageText}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
// A component that loses its JSDoc must lose its README too, so clear the last build's.
for (const d of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, d, "README.md"), { force: true });
fs.writeFileSync(path.join(outDir, "bundle.js"), js);
fs.writeFileSync(path.join(outDir, "bundle.css"), fonts + css.css + vars);
fs.writeFileSync(path.join(outDir, "index.d.ts"), dts);
for (const [name, md] of Object.entries(readmes)) {
  fs.mkdirSync(path.join(outDir, name), { recursive: true });
  fs.writeFileSync(path.join(outDir, name, "README.md"), md);
}
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`bundle.js ${kb(js)}, ${components.length} components; bundle.css ${kb(fonts + css.css + vars)}; index.d.ts ${kb(dts)}; ${Object.keys(readmes).length} READMEs -> ${path.relative(root, outDir)}`);
