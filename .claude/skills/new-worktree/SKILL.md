---
name: new-worktree
description: Create an isolated worktree and warm it up before writing code. Use when starting a numbered issue, or when a task needs a checkout of its own.
---

# Start a worktree

A new worktree is **cold**: git gives you tracked files only. Warm it and prove
it green before writing code, or a missing setup step will look like a bug in
your change. Cleanup has its own skill, `remove-worktree`.

## 1. Base it on `origin/main`, explicitly

`origin/HEAD` is unset here, so name `origin/main`. A worktree cut from a stale
local `main` starts behind and shows phantom conflicts later.

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git worktree add -b <branch> .claude/worktrees/<name> origin/main
```

`.claude/worktrees/` is gitignored. State the base commit in your first message
about the work.

## 2. Warm it and prove it green, in the background

Run this as one **background** Bash call (`run_in_background: true`), from the
worktree:

```bash
cd .claude/worktrees/<name> && bash .claude/skills/new-worktree/warm.sh
```

Don't run the steps inline. The script sends all output to logs and prints one
line on success, or the tail of the failing step's log. Inline output (install
log, route table, a line per test file) stays in context for the whole session.
Use the ~2 minutes it takes to read the ticket or ask design questions.

It runs, in order:

- `npm ci`, because **`node_modules` is not shared.** Without it Turbopack
  compiles nothing (every route 500s) and every server-seam test fails to
  import. A junction or symlink makes it worse; see `verify-running-app`.
- A copy of `.env.local`, which is **gitignored**. Without it `db()` throws
  `DATABASE_URL is not set`. The copy points at the shared Neon database.
- `npx next build`, which writes **`.next/types`**. Without it `typecheck`
  reports `Cannot find name 'LayoutProps'` in `src/app/layout.tsx`. It applies
  no migrations, so it is safe here.
- `typecheck`, `vitest --reporter=dot` and `eslint src`. They all pass on
  untouched `origin/main`, so the first failure afterwards belongs to your
  change.

Pass `--skip-checks` to stop after the build. That's fine for a small change,
because the push gate runs the checks anyway.

If it fails on untouched code, the warm-up is incomplete, not `src`: fix that
setup step, don't edit code.

## 3. Claim a port that is yours alone

`next dev` doesn't stop when its port is taken. It warns and moves up, so two
checkouts aimed at 3000 means one silently serves the other's code. Pick a free
port, keep it in a variable, and use it for every request
(`verify-running-app` step 1).

## 4. Note what running here writes

The database is shared, so a commissioner action taken to check a screen is a
real write other people see.

`git push` runs `.claude/hooks/preflight.sh`: build, typecheck, test and eslint,
with the push blocked on failure. After step 2 it takes about ten seconds.
