---
name: new-worktree
description: Create an isolated worktree and warm it up before writing code. Use when starting a numbered issue, or when a task needs a checkout of its own.
---

# Start a worktree

A new worktree is **cold**: git gives you tracked files and nothing else. Three
things the repo needs are untracked or generated, so they are absent, and each
one fails in a way that looks like a bug in your change rather than a missing
setup step. Warm the checkout first, prove it green, then start work.

Cleanup is the other half and has its own skill — `remove-worktree`.

## 1. Base it on `origin/main`, explicitly

`main` moves while you work. Another session merges, and a worktree cut from a
stale local `main` starts life behind, which surfaces later as a phantom
conflict or a false "unmerged commits" reading.

`origin/HEAD` is unset in this repo, so a bare `origin` does not resolve to a
branch. Name `origin/main`:

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git worktree add -b <branch> .claude/worktrees/<name> origin/main
cd .claude/worktrees/<name>
```

`.claude/worktrees/` is gitignored, so worktrees live inside the repo without
showing up as changes.

State the base branch in your first message about the work. A worktree whose
base was never confirmed is the single cheapest thing to get wrong here.

## 2. Warm it up

Three commands, all from the worktree root:

```bash
npm ci --no-audit --no-fund
cp "$(git rev-parse --git-common-dir)/../.env.local" .env.local
npx next build
```

Each covers one cold gap:

- **`node_modules` is not shared.** Turbopack takes the worktree's own lockfile
  as the workspace root, finds no `next` beneath it, and compiles nothing —
  every route answers 500, and every server-seam test fails to import. A real
  install is the only fix; `verify-running-app` has the errors and explains why
  a junction or symlink makes it worse.
- **`.env.local` is gitignored**, so `db()` throws `DATABASE_URL is not set` on
  the first request. The copy points this checkout at the same shared Neon
  database as every other — see `verify-running-app` for what that means before
  you drive a commissioner screen.
- **`.next/types` does not exist yet**, and until it does `npm run typecheck`
  reports `Cannot find name 'LayoutProps'` in `src/app/layout.tsx`. That is the
  cold checkout talking, not your diff. `npx next build` writes those types, and
  applies no migrations, so it is safe to run here.

## 3. Prove it green before writing code

```bash
npm run typecheck && npm run test && npx eslint src
```

All three pass on an untouched worktree. Run them now, while the tree still
matches `origin/main`, so that the first failure you see afterwards belongs to
your change. Diagnosing a cold-start failure as a code bug costs far more than
this minute.

Hold here until all three are green. If one fails on untouched code, the warm-up
is incomplete — re-read step 2 rather than editing `src`.

## 4. Claim a port that is yours alone

`next dev` does not stop when its port is taken; it warns and moves up. So two
checkouts both aiming at 3000 means one of them silently answers with the
other's code, and the screen looks fine either way.

Pick a free port, keep it in a variable, and hand the same one to every request.
`verify-running-app` step 1 covers the trap and how to tell which checkout you
are in.

## 5. Note what running here writes

This worktree shares the Neon database with everyone else. A commissioner action
taken to check a screen is a real write other people see. Drive the console
deliberately.

Pushing from here runs the preflight gate in `.claude/hooks/preflight.sh` —
`npx next build` then `npm run typecheck`, with the push blocked if either
fails. Step 2 already leaves both warm, so the gate costs about ten seconds.
