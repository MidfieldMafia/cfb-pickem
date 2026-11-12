/**
 * Prints a PR's Screenshots section, before and after side by side, from a
 * directory of `scripts/shoot.cjs` output: `before--<key>.png` and
 * `after--<key>.png`, where a key with only an after is a new screen. The
 * section's rules are in `src/lib/pr-shots.ts`.
 *
 *   npm run pr-shots -- <issue> <dir> [--body <file>] [--member <name>] [--state "<words>"]
 *   npm run pr-shots -- <issue> <dir> --branch
 *
 * By default (a local session) it links each PNG as `./<name>` and copies the
 * PNGs next to the body file (`<dir>/body.md` unless `--body` names another),
 * so `gh pr create|edit --body-file <file> --attach ./<name>…`, run from that
 * directory, uploads them and rewrites the links. Nothing is committed.
 *
 * `--branch` is for the cloud, whose `gh` cannot `--attach` (#534): it commits
 * the PNGs to the `agent-screenshots` branch, which never merges, under
 * `<issue>/<run stamp>/`, and links them by commit, so a re-run never
 * overwrites what an earlier PR body shows. The commit is built with plumbing
 * against a scratch index, so the checkout, its branch and its index are never
 * touched.
 *
 * Either way the images end up public, as the repository is. It refuses to
 * run unless an `agent-db` branch is up: the only data a PR may ever show is
 * that fake league.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { attachLink, pngWidth, SHOT_NAME, screenshotsSection } from "../src/lib/pr-shots";

const BRANCH = "agent-screenshots";
const MAX_BYTES = 3 * 1024 * 1024;
const USAGE =
  'Usage: npm run pr-shots -- <issue> <dir> [--branch] [--body <file>] [--member <name>] [--state "<words>"]';

function git(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("git", args, { encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

/** owner/repo from origin, whether it is github.com or the cloud's git proxy. */
function repoSlug(): string {
  if (process.env.PR_SHOTS_REPO) return process.env.PR_SHOTS_REPO;
  const url = git(["remote", "get-url", "origin"]).replace(/\.git$/, "");
  const parts = url.split(/[/:]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function remoteTip(): string | null {
  try {
    git(["fetch", "--quiet", "origin", `refs/heads/${BRANCH}`]);
    return git(["rev-parse", "FETCH_HEAD"]);
  } catch {
    return null;
  }
}

function commitShots(files: string[], prefix: string, message: string): string {
  const scratch = mkdtempSync(path.join(tmpdir(), "pr-shots-"));
  const env = {
    GIT_INDEX_FILE: path.join(scratch, "index"),
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "pr-shots",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "pr-shots@users.noreply.github.com",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "pr-shots",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "pr-shots@users.noreply.github.com",
  };
  try {
    // A push can lose a race with another run; refetch and rebuild on top of it.
    for (let attempt = 1; ; attempt++) {
      const parent = remoteTip();
      git(parent ? ["read-tree", parent] : ["read-tree", "--empty"], env);
      for (const file of files) {
        const blob = git(["hash-object", "-w", file]);
        git(["update-index", "--add", "--cacheinfo", `100644,${blob},${prefix}/${path.basename(file)}`], env);
      }
      const tree = git(["write-tree"], env);
      const commit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message], env);
      try {
        git(["push", "--quiet", "origin", `${commit}:refs/heads/${BRANCH}`]);
        return commit;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      branch: { type: "boolean", default: false },
      body: { type: "string" },
      member: { type: "string" },
      state: { type: "string" },
    },
  });
  const { branch: toBranch, body, member, state } = values;
  const [issue, dir, ...rest] = positionals;
  if (!issue || !/^\d+$/.test(issue) || !dir || rest.length > 0) throw new Error(USAGE);
  if (toBranch && body) throw new Error("--body is for a local session; --branch links the committed copies instead.");
  if (!existsSync(".agent-db.json")) {
    throw new Error("No agent-db branch is up here. Screenshots are public: take them only on `npm run agent-db -- up`.");
  }

  const names = readdirSync(dir)
    .filter((name) => SHOT_NAME.test(name))
    .sort();
  if (names.length === 0) throw new Error(`No before--<key>.png or after--<key>.png files in ${dir}.`);
  const files = names.map((name) => path.join(dir, name));
  const widths = new Set<number>();
  for (const file of files) {
    if (statSync(file).size > MAX_BYTES) throw new Error(`${file} is over 3 MB.`);
    const width = pngWidth(readFileSync(file));
    if (width === null) throw new Error(`${file} is not a PNG.`);
    widths.add(width);
  }
  if (widths.size > 1) {
    throw new Error(`The shots in ${dir} are at different widths (${[...widths].join(", ")}px): take them all at one.`);
  }
  const caption = { width: [...widths][0], member, state };
  if (!member || !state) {
    console.error("No --member or --state: the caption will not say who is signed in or what the screens show.\n");
  }

  if (toBranch) {
    const prefix = `${issue}/${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")}`;
    const commit = commitShots(files, prefix, `Screenshots for #${issue}`);
    const url = (name: string) => `https://raw.githubusercontent.com/${repoSlug()}/${commit}/${prefix}/${name}`;
    console.log(screenshotsSection(names, (name) => `<img src="${url(name)}" width="300">`, caption));
    return;
  }

  const bodyFile = path.resolve(body ?? path.join(dir, "body.md"));
  const bodyDir = path.dirname(bodyFile);
  if (bodyDir !== path.resolve(dir)) {
    mkdirSync(bodyDir, { recursive: true });
    for (const file of files) copyFileSync(file, path.join(bodyDir, path.basename(file)));
  }
  console.log(screenshotsSection(names, attachLink, caption));
  const attach = names.map((name) => `--attach ./${name}`).join(" ");
  console.error(
    `\nPut the section in ${bodyFile}, then from ${bodyDir}:\n` +
      `  gh pr create --body-file ${path.basename(bodyFile)} ${attach}\n` +
      `or, for an open PR, gh pr edit <number> with the same flags.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
