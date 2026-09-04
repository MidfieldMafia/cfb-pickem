# Vercel Hobby + Neon Free + Next.js 16 constraints for Saturday Slate

Research date: 2026-09-04. Sources are official Vercel docs, Neon docs, Drizzle docs, and the
Next.js 16 docs bundled in this repo's `node_modules/next/dist/docs/`.

## Summary / recommendations

1. **Do not connect Vercel to the `MidfieldMafia` GitHub org repo on a Hobby account.** Vercel Hobby
   cannot deploy from a private repository owned by a GitHub organization at all, and even if the repo
   were public, only commits authored by the Hobby team's *owner* deploy automatically — a second
   developer's commits will not build. See "Vercel Hobby: GitHub org + collaborators" below.
   Practical options, cheapest first:
   - Keep the repo under one developer's **personal** GitHub account (not the org) and keep Vercel on
     Hobby, accepting that only that one person's pushes deploy (the other developer submits PRs that
     the owner merges/deploys).
   - Move the repo to the `MidfieldMafia` org and make it **public** (Hobby can deploy public org
     repos with an authorization step for non-owner commits).
   - Upgrade to **Vercel Pro** ($20/month for the first seat, $20/user/month per additional developer
     seat) — this is the only way to get real multi-member collaboration on a private org repo.
2. **The project is non-commercial, so Hobby's "personal, non-commercial use only" restriction is not
   a blocker** — but note it explicitly forbids any payment collection, ads, or paid consulting tied to
   the deployment. Keep it that way or upgrade to Pro.
3. **Use Neon's Free plan with the official Vercel-Neon integration** for automatic per-preview
   database branching, and use Drizzle's `neon-http` HTTP driver (not node-postgres/WebSocket) for
   normal request-scoped queries, reserving the pooled connection string for anything using
   traditional `pg`-style connections.
4. **Run `drizzle-kit generate` locally, commit the SQL migration files, and run `drizzle-kit migrate`
   as an explicit deploy step** (e.g., in `vercel-build` or a predeploy script) rather than
   `drizzle-kit push`, so production schema changes are reviewable and reproducible.
5. **Expect ~5-minute idle autosuspend and a few-hundred-ms cold start** on every Neon Free compute;
   design around it (don't assume sub-50ms first query, retry/backoff on first request).
6. **Read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` before writing any
   route/middleware/cache code** — Next.js 16 renamed `middleware.ts` to `proxy.ts`, removed sync
   `cookies()`/`params`/`searchParams`, and changed the default caching model. Details below.

---

## 1. Vercel Hobby: GitHub org, collaborators, and non-member commits

- **Hobby cannot deploy a private repo owned by a GitHub organization at all.** "You cannot deploy to
  a Hobby team from a private repository in a GitHub organization, GitLab group, or Bitbucket
  workspace. Consider making the repository public or upgrading to Pro." —
  [vercel.com/docs/git](https://vercel.com/docs/git) (`## Using Hobby teams`)
- This org restriction applies to **commit authors on GitHub organizations, GitLab groups, and
  non-personal Bitbucket workspaces**; it does not apply to collaborators on personal git accounts —
  [vercel.com/docs/git](https://vercel.com/docs/git) (`## Deploying private Git repositories`)
- For a Hobby team, **only commits authored by the Hobby team's owner deploy automatically.** This is
  verified by matching the commit author's Login Connections against the Hobby team's owner. If the
  commit author is not the owner, "the deployment will be prevented, and a recommendation to transfer
  the project to a Pro team will be displayed on the Git provider." —
  [vercel.com/docs/git](https://vercel.com/docs/git) (`### Using Hobby teams`);
  also stated at
  [vercel.com/docs/deployments/troubleshoot-project-collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
  (`### Hobby teams`): "The Hobby Plan does not support collaboration for private repositories."
- **Public repositories are an exception**: for a public repo, "commits from it will usually deploy
  automatically," but a pull request from a *fork* requires authorization from an existing team
  member — a link is posted as a PR comment — unless the committer is already a team member —
  [vercel.com/docs/git](https://vercel.com/docs/git) (`## Deploying forks of public Git repositories`)
- **On Pro**, the commit author must be a member of the Vercel team; if they have a Vercel account but
  aren't yet a member, they may be auto-added or require manual approval depending on the team's
  collaboration settings — [vercel.com/docs/git](https://vercel.com/docs/git) (`### Using Pro teams`)
- **Non-commercial use required on Hobby:** "Hobby teams are restricted to non-commercial personal use
  only. All commercial usage of the platform requires either a Pro or Enterprise plan." Commercial use
  is defined broadly as any deployment used for the financial gain of *anyone* involved in its
  production — including a paid employee/consultant writing the code, payment processing, ads
  (including Google AdSense), affiliate links as the primary purpose, or **accepting donations**. —
  [vercel.com/docs/limits/fair-use-guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
  (`### Commercial usage`)
- **Limits on Hobby:**
  - Vercel Function max duration: **300 seconds (5 minutes)** —
    [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) (comparison table)
  - Projects: **200** per account —
    [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) (comparison table)
  - Deployments per day: **100** —
    [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) (comparison table)
  - Domains per project: **50** —
    [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) (comparison table)
  - Typical/fair-use bandwidth guideline: **up to 100 GB "Fast Data Transfer"/month** and up to 10 GB
    "Fast Origin Transfer" — these are guidelines, not hard caps, and Vercel says it will reach out
    before taking action on outliers —
    [vercel.com/docs/limits/fair-use-guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
    (`### Typical monthly usage guidelines`)
  - Cron jobs: **up to 100 per project**, but Hobby cron jobs can run **no more than once per day**
    (an hourly/every-30-min expression fails at deploy time), with only per-hour (±59 min) scheduling
    precision — [vercel.com/docs/cron-jobs/usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
    (`## Hobby scheduling limits`)
- **Cheapest paid step up:** **Pro plan, $20/month**, which includes one developer seat; additional
  developer seats are **$20/user/month** (viewer seats are free) —
  [vercel.com/pricing](https://vercel.com/pricing) and
  [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) (`## Upgrading to Pro`, step 4)

## 2. Vercel environment variables and secrets

- Environment variables are declared per **Environment**: Production, Preview, Development, or custom
  environments (Pro only). You choose which environment(s) a variable applies to when creating it —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`## Environments`)
- Values are **encrypted at rest**, visible to anyone with project access; safe for sensitive data like
  API keys and database URLs, with a documented rotation procedure —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (intro paragraph)
- **Preview deployments** get whatever is scoped to the "Preview" environment. By default one set of
  Preview values applies to *every* non-production branch, but you can override per-branch: "Any
  branch-specific variables will override other preview environment variables with the same name," so
  you only need to add the values you want to differ, e.g., a different `DATABASE_URL` per branch —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`### Preview environment variables`)
- **Production** variables apply the next time you push to the production branch (or `vercel --prod`);
  changing a variable never retroactively affects already-built deployments —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`## Environments` table; intro)
- **Local development**: define `.env.local`, or run `vercel env pull` to sync the project's
  Development environment variables into a local `.env` file; `vercel dev` loads them automatically —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`### Development environment variables`)
- Total env var size limit: **64 KB per deployment** combined (no single variable over 64 KB) for
  Node.js/Python/Ruby/Go/PHP runtimes; Edge runtime (used by `proxy.ts`/middleware, not relevant since
  Next.js 16's `proxy.ts` runs on Node.js — see §5) is capped at 5 KB per variable —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`## Environment variable size`)
- **Integrations** (like the Neon Vercel integration, §3) can auto-populate project environment
  variables, shown as attributed to that integration in Project Settings —
  [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) (`## Integration environment variables`)

## 3. Neon free plan

- **Storage:** 0.5 GB per project —
  [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans)
- **Compute:** 100 CU-hours/month per project (enough for roughly 400 hours of a 0.25 CU compute) —
  [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans)
- **Branching:** up to 10 branches per project; 100 projects total on the account —
  [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans)
- **Autosuspend / scale-to-zero:** Free plan computes suspend after a fixed **5 minutes of
  inactivity**, and this timeout **cannot be changed or disabled** on Free (only paid Launch/Scale
  plans allow configuring 5 min–7 days or disabling it) —
  [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans);
  [neon.com/docs/introduction/compute-lifecycle](https://neon.com/docs/introduction/compute-lifecycle)
- **Cold-start latency:** resuming a suspended compute "generally takes a few hundred milliseconds";
  if the project has been idle more than 7 days the activation time is "slightly longer," and initial
  queries after wake-up are slower until Postgres's memory buffers warm up —
  [neon.com/docs/introduction/compute-lifecycle](https://neon.com/docs/introduction/compute-lifecycle)
- **Connection pooling:** Neon runs PgBouncer in front of Postgres, supporting up to 10,000 concurrent
  client connections funneled into a much smaller real connection count; pooled connection strings use
  a `-pooler` suffix on the hostname (e.g. `ep-xxx-pooler.<region>.aws.neon.tech`), obtained by toggling
  "Connection pooling" in the Neon Console's Connect dialog. Per-user/per-database pool size defaults
  to 90% of `max_connections` for the compute size, with a 2-minute queued-connection timeout —
  [neon.com/docs/connect/connection-pooling](https://neon.com/docs/connect/connection-pooling).
  Pooling matters especially for serverless functions, which open/close a connection per invocation.
- **Vercel integration:** the Neon "Vercel-Managed" native integration provisions a Neon project via
  the Vercel Marketplace (billed through the Vercel invoice) and automatically injects connection env
  vars into the linked Vercel project: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), plus
  `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` components —
  [neon.com/docs/guides/vercel-native-integration](https://neon.com/docs/guides/vercel-native-integration).
  When enabled, it **automatically creates an isolated Neon database branch for every Vercel Preview
  Deployment** (copy-on-write, so schema/data experiments in a PR don't touch production), and cleans
  up preview branches when the corresponding Vercel deployment/branch is deleted —
  [neon.com/docs/guides/vercel-native-integration](https://neon.com/docs/guides/vercel-native-integration)
  (`## Automated Preview Branching`).

## 4. Drizzle with Neon

- Drizzle's Neon-specific adapters are `drizzle-orm/neon-http` (HTTP) and `drizzle-orm/neon-websockets`
  / `neon-serverless` (WebSocket, drop-in replacement for `pg`). Recommended default for serverless:
  ```ts
  import { neon } from '@neondatabase/serverless'
  import { drizzle } from 'drizzle-orm/neon-http'
  const sql = neon(process.env.DATABASE_URL!)
  const db = drizzle({ client: sql })
  ```
  "Querying over HTTP is faster for single, non-interactive transactions," which fits Vercel functions
  handling isolated requests; use the WebSocket driver instead when you need session-level or
  interactive multi-statement transactions — Drizzle docs,
  [orm.drizzle.team/docs/get-started/neon-new](https://orm.drizzle.team/docs/get-started/neon-new).
  A plain `pg`/node-postgres connection to Neon is also supported for non-serverless/long-lived
  processes, but is not the serverless-optimized path.
- **Migrations for a Vercel-deployed app:** Drizzle's own guidance is to generate migration SQL with
  `drizzle-kit generate`, commit the generated files, and apply them with `drizzle-kit migrate` — not
  `drizzle-kit push` in production, since `push` applies changes immediately with no history and can
  silently drop columns — [orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations).
  In practice for Vercel this is usually wired up as an explicit step in the build/deploy pipeline
  (e.g., a `predeploy`/`vercel-build` script or CI job that runs `drizzle-kit migrate` against
  `DATABASE_URL_UNPOOLED`/direct connection before or during the Next.js build), so that every
  successful deployment corresponds to an already-migrated database — corroborated by Vercel Community
  guidance: "Running drizzle migrations for my DB before Next.js starts on Vercel" and "How to run
  Drizzle migrations during a deployment?" (Vercel Community threads,
  https://community.vercel.com/t/running-drizzle-migrations-for-my-db-before-next-js-starts-on-vercel/18074,
  https://community.vercel.com/t/how-to-run-drizzle-migrations-during-a-deployment/1529). Because Neon
  Preview branches are created per-deployment (§3), a migration step should run against **each
  branch's own connection string**, not a shared one.

## 5. Next.js 16 breaking changes relevant to this app

This repo runs `next@16.3.4`. `AGENTS.md` correctly instructs reading
`node_modules/next/dist/docs/` before writing code; the following are the conventions that differ from
Next.js 14/15 and are relevant to an App Router app with route handlers, server actions,
proxy/middleware, cookies, and caching.

- **`middleware.ts` → `proxy.ts` (breaking rename).** "The `middleware` filename is deprecated, and has
  been renamed to `proxy` ... The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is
  `nodejs`, and it cannot be configured." The exported function should be renamed `proxy` (default or
  named export both work) — `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
  (`## middleware to proxy`). Functionally equivalent to middleware otherwise — same `matcher` config,
  same `NextRequest`/`NextResponse`, same cookie/header APIs —
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`. Config flags
  renamed too, e.g. `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.
  A codemod (`npx @next/codemod@canary upgrade latest`) can do this rename automatically —
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (`## Using the codemod`).
  **Important for auth/session logic:** [Server Actions] are not separate routes for proxy-matching
  purposes — they're POSTs to the page route that defined them, so a proxy `matcher` that excludes a
  path also skips proxy coverage for Server Actions defined on that path. Always re-check
  auth/authorization inside each Server Action rather than relying on proxy alone —
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (`## Execution order`).
- **Async Request APIs are now fully async, no sync fallback.** `cookies()`, `headers()`,
  `draftMode()`, and `params`/`searchParams` in pages/layouts/route handlers must be `await`-ed;
  Next.js 15's temporary synchronous-access compatibility shim is removed in 16 —
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (`## Async Request APIs (Breaking change)`).
  `cookies()` itself is documented as always-async: `const cookieStore = await cookies()` —
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`. Use
  `npx next typegen` to generate the `PageProps`/`LayoutProps`/`RouteContext` helper types for
  type-safe async param access.
- **Route Handlers are dynamic (uncached) by default**, same as prior versions — only `GET` can opt
  into caching via `export const dynamic = 'force-static'`; all other HTTP methods are never cached —
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (`### Caching`).
  If `cacheComponents` is enabled (see below), `GET` handlers instead follow the same
  prerendering-by-default model as pages: they run at request time unless they avoid all uncached/
  runtime data, in which case they can be statically prerendered —
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (`#### With Cache Components`).
- **Server Actions dispatch sequentially per client** — Next.js queues a user's actions one at a time,
  so `Promise.all` across multiple Server Action calls from the client does not run them in parallel;
  do parallel work inside one action or via a Server Component/Route Handler instead —
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (`## Sequential dispatch on the client`).
  A Server Action's response can bundle a UI re-render in the same round trip when the action calls
  `updateTag`, `revalidatePath`, `refresh`, `redirect`, or mutates cookies — otherwise the action
  returns only its value with no re-render —
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (`## A single response carries data and UI`).
  Framework CSRF/body-size protections exist (1MB default body cap, Origin/Host check) but are **not**
  a substitute for authenticating/authorizing/validating inputs inside every action —
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (`## Security`).
- **Caching model change (`revalidateTag`/`updateTag`) and opt-in Cache Components.** `revalidateTag`
  now requires a second `cacheLife` profile argument (`revalidateTag('posts', 'max')`); the new
  `updateTag` gives read-your-writes semantics for use inside Server Actions; a new `refresh()`
  function refreshes the client router from a Server Action without touching the cache —
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (`## Caching APIs`). The
  experimental `experimental_ppr` flag and `experimental.dynamicIO`/`experimental.useCache` are removed;
  the successor is the top-level `cacheComponents: true` config option, which is **not enabled by
  default** in this project (this repo's `next.config.ts` currently sets no such option, so the app is
  on the "previous" non-Cache-Components caching model by default) —
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (`## Partial Prerendering (PPR)`, `### experimental.dynamicIO and experimental.useCache`);
  `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` (intro note pointing at the
  "Previous Model" guide when `cacheComponents` is off). If/when `cacheComponents` is turned on, the
  `use cache` directive (data-level or whole-component) plus `cacheLife`/`cacheTag` becomes the primary
  caching mechanism, and calling `cookies()`/`headers()` outside a `<Suspense>` boundary will block
  prerendering of that route —
  `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`;
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` (`## Good to know`).
- **Other environment-relevant changes:** Turbopack is now the default and only supported bundler for
  `next dev`/`next build` (a project-level `webpack` config now fails the build unless you pass
  `--webpack` or `--turbopack` explicitly); Node.js 20.9+ and TypeScript 5.1+ are required minimums;
  `serverRuntimeConfig`/`publicRuntimeConfig` are removed in favor of `process.env` (server) and
  `NEXT_PUBLIC_`-prefixed vars (client) —
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
  (`## Turbopack by default`, `## Node.js runtime and browser support`, `### Runtime Configuration`).
  These interact with Vercel deployment in that Vercel's build image already satisfies the Node.js
  version requirement, but a local dev machine or a custom CI runner must also be on Node 20.9+.
