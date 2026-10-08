/**
 * Lists this repo's Claude Code sessions, most recently active first, for a
 * retro or for finding the session that did a piece of work:
 *
 *   npm run sessions                 # the last 7 days
 *   npm run sessions -- --days 30
 *   npm run sessions -- --json       # every field, with the transcript path
 *
 * Two things make finding them by hand unreliable. A transcript's modified time
 * is not when the session ran: Claude Code appends bookkeeping entries (titles,
 * last-prompt markers) to old transcripts. And a session started in a worktree
 * is filed under its own project folder, not the main checkout's. So this reads
 * every folder for the repo and its worktrees, and dates each session by its
 * last user or assistant message.
 *
 * It reads Claude Code's private transcript format, which can change under it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type Session = {
  id: string;
  title: string;
  firstActive: Date;
  lastActive: Date;
  modified: Date;
  prompts: number;
  branch: string;
  worktree: string | null;
  prs: number[];
  file: string;
};

type Entry = {
  type?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  toolUseResult?: unknown;
  cwd?: string;
  gitBranch?: string;
  message?: { content?: unknown };
  aiTitle?: string;
  customTitle?: string;
  prNumber?: number;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const days = Number(option("days") ?? 7);
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days takes a positive number");
  process.exit(1);
}

// The main checkout, even when run from a worktree.
const commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
  encoding: "utf8",
}).trim();
const repoRoot = path.dirname(path.resolve(commonDir));

// Claude Code names a project folder after its cwd, with every character
// other than a letter or digit replaced by "-".
const slug = (p: string) => path.resolve(p).replace(/[^A-Za-z0-9]/g, "-");
const projectsDir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"), "projects");
const own = slug(repoRoot);
const worktreePrefix = slug(path.join(repoRoot, ".claude", "worktrees")) + "-";
const folders = readdirSync(projectsDir).filter((d) => d === own || d.startsWith(worktreePrefix));

/** A prompt the person typed: a message or a slash command, not a tool result or a notice. */
function isPrompt(e: Entry): boolean {
  if (e.type !== "user" || e.isMeta || e.isSidechain || e.toolUseResult !== undefined) return false;
  const content = e.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.find((c): c is { type: "text"; text: string } => c?.type === "text")?.text
        : undefined;
  if (!text) return false;
  return !text.startsWith("<") || text.startsWith("<command-name>");
}

function promptText(e: Entry): string {
  const content = e.message?.content;
  const text = typeof content === "string" ? content : "";
  const command = text.match(/<command-name>([^<]*)<\/command-name>/);
  return (command ? command[1] : text).replace(/\s+/g, " ").trim();
}

function read(file: string): Session | null {
  let first: Date | null = null;
  let last: Date | null = null;
  let prompts = 0;
  let replied = false;
  let firstTyped = "";
  let firstCommand = "";
  let aiTitle = "";
  let customTitle = "";
  let cwd = "";
  let branch = "";
  const prs = new Set<number>();

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let e: Entry;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // a line still being written
    }
    if (e.type === "ai-title" && e.aiTitle) aiTitle = e.aiTitle;
    if (e.type === "custom-title" && e.customTitle) customTitle = e.customTitle;
    if (e.type === "pr-link" && e.prNumber) prs.add(e.prNumber);
    if ((e.type === "user" || e.type === "assistant") && e.timestamp && !e.isMeta) {
      const t = new Date(e.timestamp);
      if (!first || t < first) first = t;
      if (!last || t > last) last = t;
      if (e.cwd) cwd = e.cwd;
      if (e.gitBranch) branch = e.gitBranch;
      if (e.type === "assistant") replied = true;
    }
    if (isPrompt(e)) {
      prompts++;
      const text = promptText(e);
      if (text.startsWith("/")) firstCommand ||= text;
      else firstTyped ||= text;
    }
  }
  // Claude never replied: a slash command like /clear or /plugin, not work.
  if (!first || !last || !replied) return null;

  const worktree = cwd.match(/[\\/]\.claude[\\/]worktrees[\\/]([^\\/]+)/)?.[1] ?? null;
  return {
    id: path.basename(file, ".jsonl"),
    title: customTitle || aiTitle || (firstTyped || firstCommand).slice(0, 60) || "(untitled)",
    firstActive: first,
    lastActive: last,
    modified: statSync(file).mtime,
    prompts,
    branch,
    worktree,
    prs: [...prs].sort((a, b) => a - b),
    file,
  };
}

const since = Date.now() - days * 86_400_000;
const sessions = folders
  .flatMap((d) =>
    readdirSync(path.join(projectsDir, d))
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(projectsDir, d, f)),
  )
  // A transcript untouched since the cutoff cannot hold a message after it.
  .filter((f) => statSync(f).mtimeMs >= since)
  .map(read)
  .filter((s): s is Session => s !== null && s.lastActive.getTime() >= since)
  .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

if (flag("json")) {
  console.log(JSON.stringify(sessions, null, 2));
  process.exit(0);
}

const pad = (n: number) => String(n).padStart(2, "0");
const when = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const span = (s: Session) => {
  const minutes = Math.round((s.lastActive.getTime() - s.firstActive.getTime()) / 60_000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;
};

console.log(`${sessions.length} session(s) active in the last ${days} day(s), newest first\n`);
for (const s of sessions) {
  // A session's branch is recorded where it started, so it says nothing once it moves into a worktree.
  const where = s.worktree ? `worktree ${s.worktree}` : s.branch;
  const prs = s.prs.length ? `  PR ${s.prs.map((n) => `#${n}`).join(" ")}` : "";
  console.log(`${when(s.lastActive)}  ${span(s).padStart(5)}  ${String(s.prompts).padStart(3)} prompts  ${s.id.slice(0, 8)}  ${s.title}`);
  console.log(`${" ".repeat(18)}${where}${prs}`);
}
