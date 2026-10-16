// What a save in the Artifact's page writes, as far as render.mjs and check-served.mjs need it.
// The page compiles every type style in tokens.json into an unlayered `.<name> { … }` rule in
// tokens.css, and rewrites that file only on a save, never on a publish.
import fs from "node:fs";
import path from "node:path";

/**
 * The `project/…` paths staged under `out` whose bytes differ from the copy `read` saved under
 * `artifact`, or that it has no copy of: what one publish sends. The build stages every component
 * README, most unchanged.
 */
export const changed = (out, artifact) => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const root = path.join(out, "project");
  return walk(root)
    .map((f) => path.join("project", path.relative(root, f)))
    .filter((rel) => {
      const was = path.join(artifact, rel);
      return !fs.existsSync(was) || !fs.readFileSync(was).equals(fs.readFileSync(path.join(out, rel)));
    })
    .sort();
};

export const typeStyles = (tokensJson) =>
  fs.existsSync(tokensJson)
    ? (JSON.parse(fs.readFileSync(tokensJson, "utf8")).type?.groups ?? []).flatMap((g) => (g.styles ?? []).map((s) => s.name))
    : [];

const TYPE_RULE = /\n\.([A-Za-z0-9_-]+) \{[^}]*\}/g;

/** The `.<name>` rules in tokens.css that no type style in `styles` defines: left by a save that never happened. */
export const staleTypeRules = (tokensCss, styles) => [...tokensCss.matchAll(TYPE_RULE)].map((m) => m[1]).filter((n) => !styles.includes(n));

/** tokens.css as the next save writes it: the type-style rules `styles` no longer has, dropped. */
export const afterSave = (tokensCss, styles) => tokensCss.replace(TYPE_RULE, (rule, n) => (styles.includes(n) ? rule : ""));
