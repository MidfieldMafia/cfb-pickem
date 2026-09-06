@AGENTS.md

## Checks

Verify with `npm run typecheck`, `npm run test`, and `npx eslint src`.

A fresh worktree needs `npm ci` before any of them: `node_modules` is not shared, and `vitest.config.ts` resolves its `server-only` alias relative to itself, so without a local install every server-seam suite fails to import. `typecheck` also reports `Cannot find name 'LayoutProps'` in `src/app/layout.tsx` until `next dev` has run there once and written `.next/types`.

Do not run `npm run build` to check your work. It is `drizzle-kit migrate && next build`, and `DATABASE_URL` in `.env.local` points at a shared Neon database, so the build applies migrations to a database other people are using. A real build belongs on Vercel's preview deploy.

## Agent skills

### Verifying a rendered change

Nothing in the test suite covers rendering, and every screen needs a Magic Link to reach. See `.claude/skills/verify-running-app/SKILL.md`.

### Issue tracker

Issues live in GitHub Issues for `MidfieldMafia/cfb-pickem`; the roadmap is the `wayfinder:map` issue and every ticket is a sub-issue of it with an `owner:jonah` or `owner:alex` label. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/`, research in `docs/research/`. See `docs/agents/domain.md`.
