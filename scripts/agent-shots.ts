/**
 * Publishes an agent:go run's screenshots so its PR can show them: commits the
 * PNGs to the `agent-screenshots` branch, which never merges, and prints the
 * PR's Screenshots section with before and after side by side.
 *
 *   npm run agent-shots -- <issue> <dir>
 *
 * The directory holds `.claude/skills/agent-go/shoot.cjs` output,
 * `before--<key>.png` and `after--<key>.png`; a key with only an after is a
 * new screen. Files land at `<issue>/<run stamp>/` and the links name the
 * commit, so a re-run never overwrites what an earlier PR body shows.
 *
 * The repository is public, so these images are too. It refuses to run unless
 * an `agent-db` branch is up: the only data it may ever show is that fake
 * league. The commit is built with plumbing against a scratch index, so the
 * checkout, its branch and its index are never touched.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BRANCH = "agent-screenshots";
const MAX_BYTES = 3 * 1024 * 1024;

function git(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("git", args, { encoding: "utf8", env: { ...process.env, ...env } }).trim();
}

/** owner/repo from origin, whether it is github.com or the cloud's git proxy. */
function repoSlug(): string {
  if (process.env.AGENT_SHOTS_REPO) return process.env.AGENT_SHOTS_REPO;
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
  const scratch = mkdtempSync(path.join(tmpdir(), "agent-shots-"));
  const env = {
    GIT_INDEX_FILE: path.join(scratch, "index"),
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "agent-shots",
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "agent-shots@users.noreply.github.com",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "agent-shots",
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "agent-shots@users.noreply.github.com",
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
  const [issue, dir] = process.argv.slice(2);
  if (!issue || !/^\d+$/.test(issue) || !dir) throw new Error("Usage: npm run agent-shots -- <issue> <dir>");
  if (!existsSync(".agent-db.json")) {
    throw new Error("No agent-db branch is up here. Screenshots are public: take them only on `npm run agent-db -- up`.");
  }

  const files = readdirSync(dir)
    .filter((name) => /^(before|after)--[a-z0-9-]+\.png$/.test(name))
    .map((name) => path.join(dir, name))
    .sort();
  if (files.length === 0) throw new Error(`No before--<key>.png or after--<key>.png files in ${dir}.`);
  for (const file of files) {
    if (statSync(file).size > MAX_BYTES) throw new Error(`${file} is over 3 MB.`);
  }

  const prefix = `${issue}/${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "")}`;
  const commit = commitShots(files, prefix, `Screenshots for #${issue}`);
  const url = (name: string) => `https://raw.githubusercontent.com/${repoSlug()}/${commit}/${prefix}/${name}`;

  const keys = [...new Set(files.map((file) => path.basename(file).replace(/^(before|after)--|\.png$/g, "")))];
  const has = (side: string, key: string) => files.some((file) => path.basename(file) === `${side}--${key}.png`);
  const cell = (side: string, key: string) =>
    has(side, key) ? `<img src="${url(`${side}--${key}.png`)}" width="300">` : side === "before" ? "_new_" : "_gone_";

  console.log("## Screenshots\n");
  console.log("_The fake `agent-db` league at 390px. Before is `main`, after is this branch._\n");
  console.log("| Screen | Before | After |\n|---|---|---|");
  for (const key of keys) console.log(`| \`${key}\` | ${cell("before", key)} | ${cell("after", key)} |`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
