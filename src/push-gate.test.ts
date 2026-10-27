import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The push gate (`.claude/hooks/preflight.sh`) runs the build and every check
 * before a `git push` leaves the machine. Its two ways of going wrong cost
 * differently: a missed push ships an unchecked diff, and a false one costs an
 * `npm ci` and a build, or blocks a command that never pushed at all (#517).
 */

const require = createRequire(import.meta.url);
const { decideTarget } = require("../.claude/hooks/decide-target.cjs") as {
  decideTarget: (command: string, cwd: string) => string | null;
};

describe("which commands the gate reads as a push", () => {
  it("gates a plain push in the session's directory", () => {
    expect(decideTarget("git push -u origin HEAD", "/repo")).toBe("/repo");
  });

  it("gates a push after a cd, in the directory it moved to", () => {
    expect(decideTarget("cd /repo/.claude/worktrees/x && git push", "/repo")).toBe("/repo/.claude/worktrees/x");
  });

  it("gates git -C <dir> push, relative to the caller's directory", () => {
    expect(decideTarget("git -C wt push origin HEAD", "/repo")).toBe("/repo/wt");
  });

  it("does not gate a heredoc whose body mentions git push", () => {
    const cmd = [
      "gh issue create --title 'Gate bug' --body-file - <<'EOF'",
      "Running `cd x && git push` in one command",
      "git push",
      "EOF",
    ].join("\n");
    expect(decideTarget(cmd, "/repo")).toBeNull();
  });

  it("does not gate a body passed as a heredoc inside a quoted command substitution", () => {
    const cmd = [
      `gh pr create --title "Fix the gate" --body "$(cat <<'EOF'`,
      `It said "BLOCKED" on a docs branch (and the cause was the push gate):`,
      "cd docs && git push",
      "EOF",
      `)"`,
    ].join("\n");
    expect(decideTarget(cmd, "/repo")).toBeNull();
  });

  it("does not gate a quoted string that mentions git push, across lines and operators", () => {
    expect(decideTarget(`git commit -m "Gate fix\n\ngit push; git push && git push"`, "/repo")).toBeNull();
    expect(decideTarget(`echo 'run: cd x && git push'`, "/repo")).toBeNull();
    expect(decideTarget("ls # then git push", "/repo")).toBeNull();
  });

  it("still gates a push after a commit whose message is quoted", () => {
    expect(decideTarget(`git commit -m "Say 'push' twice; it's fine" && git push`, "/repo")).toBe("/repo");
  });

  it("gates a push after a heredoc ends", () => {
    const cmd = ["cat > docs/note.md <<EOF", "git push", "EOF", "git add docs && git commit -m note && git push"].join("\n");
    expect(decideTarget(cmd, "/repo")).toBe("/repo");
  });

  it("gates a push inside a command substitution, quoted or not", () => {
    expect(decideTarget("out=$(git push 2>&1)", "/repo")).toBe("/repo");
    expect(decideTarget(`echo "pushed: $(git push)"`, "/repo")).toBe("/repo");
    expect(decideTarget("echo `git push`", "/repo")).toBe("/repo");
    expect(decideTarget("(cd /wt && git push)", "/repo")).toBe("/wt");
  });

  it("reads a quoted directory as one token", () => {
    expect(decideTarget(`cd "/my repo" && git push`, "/")).toBe("/my repo");
    expect(decideTarget(`git -C '/my repo' push`, "/")).toBe("/my repo");
  });

  it("joins a line continuation rather than splitting on it", () => {
    expect(decideTarget("git \\\n  push origin HEAD", "/repo")).toBe("/repo");
  });

  it("throws on what it cannot read, so the hook falls back to its coarse match", () => {
    expect(() => decideTarget(`git commit -m "unterminated && git push`, "/repo")).toThrow();
  });
});

/**
 * The hook itself, on a fresh clone with no node_modules: a push it lets
 * through exits 0, and one it gates stops at the node_modules check with exit 2
 * before any check runs, so these never build anything.
 */
describe("the gate on a docs-only branch", () => {
  const HOOK = path.resolve(".claude/hooks/preflight.sh");
  let root: string;
  let clone: string;

  const git = (...args: string[]) => execFileSync("git", ["-C", clone, ...args], { stdio: "pipe" });
  const write = (file: string, text = "x\n") => {
    mkdirSync(path.dirname(path.join(clone, file)), { recursive: true });
    writeFileSync(path.join(clone, file), text);
  };
  /**
   * The hook's verdict on `command`, as Claude Code would run it from the clone.
   * The process starts outside any package, so a hook that loses track of the
   * directory gates nothing here, rather than running the real checks on this
   * checkout.
   */
  const gate = (command: string) =>
    spawnSync("bash", [HOOK], {
      cwd: root,
      input: JSON.stringify({ cwd: clone, tool_input: { command } }),
      encoding: "utf8",
      timeout: 30_000,
    });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "push-gate-"));
    clone = path.join(root, "clone");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", path.join(root, "origin.git")]);
    execFileSync("git", ["init", "-q", "-b", "main", clone]);
    git("config", "user.email", "gate@example.com");
    git("config", "user.name", "Gate");
    git("config", "commit.gpgsign", "false");
    write("package.json", JSON.stringify({ dependencies: { next: "16.0.0" } }));
    write("docs/existing.md");
    git("add", ".");
    git("commit", "-qm", "base");
    git("remote", "add", "origin", path.join(root, "origin.git"));
    git("push", "-q", "origin", "main");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const COMMIT_AND_PUSH =
    "git checkout -b research && git add -A && git commit -m 'Research' && git push -u origin research";

  it("lets a branch, commit and push in one command through when the change is under docs/", () => {
    write("docs/research/topic.md");
    expect(gate(COMMIT_AND_PUSH).status).toBe(0);
  });

  it("still gates the same command when any change is outside docs/: committed, staged or untracked", () => {
    for (const stray of ["committed", "staged", "untracked"]) {
      write("docs/research/topic.md");
      write(`src/${stray}.ts`);
      if (stray !== "untracked") git("add", "-A");
      if (stray === "committed") git("commit", "-qm", stray);
      const result = gate(COMMIT_AND_PUSH);
      expect(result.status, stray).toBe(2);
      expect(result.stderr).toContain("no node_modules");
      git("reset", "-q", "--hard", "origin/main");
      git("clean", "-qfd");
    }
  });

  it("still gates a push with nothing changed against origin/main", () => {
    expect(gate("git push origin main").status).toBe(2);
  });

  it("still gates when there is no origin/main to compare with", () => {
    write("docs/research/topic.md");
    git("remote", "remove", "origin");
    expect(gate(COMMIT_AND_PUSH).status).toBe(2);
  });

  it("names the docs-only skip and the commit-then-push workaround when it blocks", () => {
    const { stderr } = gate("git push origin main");
    expect(stderr).toContain("under docs/ skips the gate");
    expect(stderr).toContain("commit them first, then push as a separate command");
  });

  it("does not gate a command that only writes about pushing", () => {
    write("src/app.ts");
    const cmd = ["gh issue create --body-file - <<'EOF'", "git push", "EOF"].join("\n");
    expect(gate(cmd).status).toBe(0);
  });
});
