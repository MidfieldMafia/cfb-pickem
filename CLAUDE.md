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

Issues live in GitHub Issues for `MidfieldMafia/cfb-pickem`; each roadmap is a `wayfinder:map` issue (v1 and v2 so far) and every ticket is a sub-issue of one with an `owner:jonah` or `owner:alex` label. See `docs/agents/issue-tracker.md`.

### Claude Design systems

`packages/design-system` is represented in Claude Design by two objects, and neither updates the other:

- **The claude.ai/design project** (`13ff5b45-b28a-4add-8ab7-10ba929c294d`) is a build-produced mirror of the package. `/design-sync` compiles the package and writes the changed components into it. It only writes that direction — nothing flows from the project back into this repo. Its inputs live in `.design-sync/` (see `.design-sync/NOTES.md`). Re-sync after changing a component.
- **The Artifact "Saturday Slate Design System"** (https://claude.ai/artifact/LaNEaker2yyAez16eThdfU) is a static reference copy: brand-book README, token usage notes, contrast and layout guidelines, brand marks, pennants, all 136 logos and hand-written component previews. It is what designs and decks built with the Artifact tool read. `/design-sync` cannot reach it, so a package change reaches it only by editing `project/` by hand and republishing.

Neither is read by the build, the tests or the app, and neither gates a PR. Use the project when a component changed and the mirror should follow; use the Artifact when making a mockup or deck in the brand.

Do not create another design system of either kind. Three near-identical ones were built from this package on 2026-09-20 by sessions that did not look for an existing one, and were consolidated into these two. List what exists first (`Artifact` `action: "list"` or `quickstart`; `DesignSync` `list_projects`). The package wins wherever any of them disagree.

### Domain docs

Single-context: `CONTEXT.md` at the root, ADRs in `docs/adr/`, research in `docs/research/`. See `docs/agents/domain.md`.
