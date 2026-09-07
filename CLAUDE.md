@AGENTS.md

## Checks

Verify with `npm run typecheck`, `npm run test`, and `npx eslint src`.

A fresh worktree needs `npm ci` before any of them: `node_modules` is not shared, and `vitest.config.ts` resolves its `server-only` alias relative to itself, so without a local install every server-seam suite fails to import. `typecheck` also reports `Cannot find name 'LayoutProps'` in `src/app/layout.tsx` until `next dev` has run there once and written `.next/types`.

Do not run `npm run build` to check your work. It is `drizzle-kit migrate && next build`, and `DATABASE_URL` in `.env.local` points at a shared Neon database, so the build applies migrations to a database other people are using.

Do run `npx next build` — the second half on its own — whenever a diff touches a `"use server"` file, a route handler, or the client/server boundary. It applies no migrations, so it is safe here, and it is the only local check for the rules the three above cannot see:

- **Every export of a `"use server"` file must be an `async` function.** `export function a(): Promise<T>` is valid TypeScript and a build error. This is easy to introduce while turning an action file into a thin adapter over a lib function.
- A `"use client"` file must not reach a `server-only` module.
- A `route.ts` may export nothing but its handlers.

`tsc` only types-check, Vitest never loads the app's server-action boundary — least of all when the logic has been moved into `src/lib` to make it testable — and no ESLint rule here covers any of it. PR #66's preview went red on the first rule after all three came back green.

Fetching a page from `next dev` does not substitute. Every console and member screen answers **307** from its layout's auth guard before rendering, so the page's own module graph, its server actions included, is never compiled — and the 307 looks identical whether the code builds or not. Never read a redirect as evidence that a route compiles.

## Agent skills

### Verifying a rendered change

Nothing in the test suite covers rendering, and every screen needs a Magic Link to reach. See `.claude/skills/verify-running-app/SKILL.md`.

### Issue tracker

Issues live in GitHub Issues for `MidfieldMafia/cfb-pickem`; the roadmap is the `wayfinder:map` issue and every ticket is a sub-issue of it with an `owner:jonah` or `owner:alex` label. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/`, research in `docs/research/`. See `docs/agents/domain.md`.
