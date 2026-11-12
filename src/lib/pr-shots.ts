/**
 * The Screenshots section of a PR (`scripts/pr-shots.ts`): before and after
 * side by side, one row per screen key. A local session links each PNG as
 * `./<name>` for `gh --attach` to upload; the cloud links the copy it
 * committed to the `agent-screenshots` branch. The section is the same either
 * way, so the rules are here.
 */

/** `before--picks.png` and `after--picks.png` share the key `picks`. */
export const SHOT_NAME = /^(before|after)--([a-z0-9-]+)\.png$/;

export interface Caption {
  /** CSS px the shots were taken at. */
  width: number;
  /** The fake member signed in, as `agent-db session` named them. */
  member?: string;
  /** The state the screens show, in a few words. */
  state?: string;
}

/** The italic line that says what the shots show. */
function captionLine({ width, member, state }: Caption): string {
  const parts = [`The fake \`agent-db\` league at ${width}px`];
  if (member) parts.push(`signed in as ${member}`);
  if (state) parts.push(state);
  return `_${parts.join(", ")}. Before is \`main\`, after is this branch._`;
}

/**
 * The section for these file names, each cell rendered by `link`; a key with
 * no before is `_new_`, one with no after `_gone_`. Keys sort by name.
 */
export function screenshotsSection(names: string[], link: (name: string) => string, caption: Caption): string {
  const shots = new Set(names.filter((name) => SHOT_NAME.test(name)));
  const keys = [...new Set([...shots].map((name) => name.match(SHOT_NAME)![2]))].sort();
  const cell = (side: "before" | "after", key: string) => {
    const name = `${side}--${key}.png`;
    return shots.has(name) ? link(name) : side === "before" ? "_new_" : "_gone_";
  };
  return [
    "## Screenshots",
    "",
    captionLine(caption),
    "",
    "| Screen | Before | After |",
    "|---|---|---|",
    ...keys.map((key) => `| \`${key}\` | ${cell("before", key)} | ${cell("after", key)} |`),
  ].join("\n");
}

const PNG_SIGNATURE = "89504e470d0a1a0a";

/**
 * The CSS width a shot was taken at: its pixel width over the device scale
 * factor of 2 that `scripts/shoot.cjs` always uses. Null for anything but a PNG.
 */
export function pngWidth(file: Buffer): number | null {
  if (file.length < 24 || file.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) return null;
  if (file.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return file.readUInt32BE(16) / 2;
}
