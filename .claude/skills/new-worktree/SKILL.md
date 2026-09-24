---
name: new-worktree
description: Create a worktree on origin/main and warm it before writing code. Use when starting a numbered issue or any task that needs its own checkout.
---

# Start a worktree

A fresh worktree is **cold**: git checks out tracked files only, and each
missing untracked piece fails in a way that looks like a bug in your change.
Warm it, see it **green** on untouched code, then write code. Cleanup is
`remove-worktree`.

## 1. Cut it from `origin/main`

```bash
cd "$(git rev-parse --path-format=absolute --git-common-dir)/.."
git fetch origin
git worktree add -b <branch> .claude/worktrees/<name> origin/main
```

Start from the main checkout: `--show-toplevel` names the worktree you are
standing in, so run from inside one it nests the new tree under it. Name
`origin/main` in full: `origin/HEAD` is unset here, and local `main` lags
behind merges from other sessions. `.claude/worktrees/` is gitignored.

**Done when** your first message about the work names the base commit.

## 2. Warm it in the background

Start one background Bash call (`run_in_background: true`):

```bash
cd .claude/worktrees/<name> && bash .claude/skills/new-worktree/warm.sh
```

The script keeps every step's output in a log and prints a single line, so the
install log, route table and test list stay out of your context for the rest of
the session. Spend the ~2 minutes reading the ticket or asking design questions.

For a small change, add `--skip-checks`: it stops after the build, and the push
gate runs typecheck, test and eslint anyway.

**Done when** it prints `worktree warm: ... all green`. A failure prints the
step name and its log tail; see [Cold gaps](#cold-gaps) and fix that setup step.
On untouched code, a failure is always a cold gap, never a bug in `src`.

## 3. Claim a port before `next dev`

`next dev` moves up silently when its port is taken, so a shared 3000 means one
checkout serves the other's code. Pick a free port, hold it in a variable, and
send every request there (`verify-running-app` step 1).

**Done when** the port is in a variable and nothing else is listening on it.

## Cold gaps

What each `warm.sh` step fills, and what its absence looks like:

- **install**: `node_modules` is per-worktree. Without it Turbopack compiles
  nothing (every route 500s) and every server-seam test fails to import. Only
  a real `npm ci` fixes it: Turbopack panics on a symlink or junction to the
  main checkout's `node_modules` ("points out of the filesystem root").
- **env**: `.env.local` is gitignored. Without it `db()` throws
  `DATABASE_URL is not set`. The copy points at the shared Neon database, so a
  commissioner action you take here is a real write.
- **build**: `npx next build` writes `.next/types`. Without them `typecheck`
  reports `Cannot find name 'LayoutProps'` in `src/app/layout.tsx`. It applies
  no migrations, so it is safe here.
- **typecheck / test / eslint**: all pass on `origin/main`, so a failure means
  the steps above left a gap.
