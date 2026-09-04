# Saturday Slate

A private college football pick'em for friends and family. Each week the commissioner
publishes a slate of games, members pick winners one game at a time, picks lock at the
first kickoff, and the app grades them against real scores and keeps the season leaderboard.

- Domain terms: [`CONTEXT.md`](CONTEXT.md)
- Roadmap and tickets: [issue #1](https://github.com/MidfieldMafia/cfb-pickem/issues/1)
- Research and decisions: [`docs/research/`](docs/research/), [`docs/adr/`](docs/adr/)

## Stack

Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui) on Vercel Hobby. Postgres on Neon
through Drizzle. Vitest for tests. Game data from [CollegeFootballData](https://collegefootballdata.com).

Next.js 16 differs from older versions (`proxy.ts` instead of `middleware.ts`, async
`cookies()`/`params`, new caching model). Read `node_modules/next/dist/docs/` before writing
route or cache code, per [`AGENTS.md`](AGENTS.md).

## Local setup

Requires Node 20.9 or newer and npm. You need access to the `cfb-pickem` Vercel project.

```bash
npm install
npx vercel login                 # once; use your GitHub account
npx vercel link                  # once; pick the cfb-pickem project
npx vercel env pull .env.local   # Development env vars, including DATABASE_URL
npm run dev                      # http://localhost:3000
```

`.env.local` is gitignored. Re-run `vercel env pull` whenever a variable changes in Vercel.
Never commit secrets; they live only in Vercel.

## Environment variables

Managed in Vercel (Production, Preview, Development). Pull them locally with `vercel env pull`.

| Variable | Source | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | Pooled connection for request-time queries (`drizzle-orm/neon-http`) |
| `DATABASE_URL_UNPOOLED` | Neon integration | Direct connection for migrations |
| `CFBD_API_KEY` | CollegeFootballData account | Game schedules and scores |
| `CRON_SECRET` | Generated | Bearer token required by scheduled route handlers |
| `NEXT_PUBLIC_APP_URL` | Vercel project | Absolute URL used in magic links and texts |

Twilio credentials are added when the text messaging ticket lands.

## Database and migrations

Schema lives in Drizzle TypeScript files. Migrations are generated locally, committed, and
applied at deploy time. Never use `drizzle-kit push` against a shared database.

```bash
npx drizzle-kit generate   # after editing the schema: writes SQL to drizzle/
git add drizzle/           # commit the SQL with the schema change
```

The `build` script runs `drizzle-kit migrate` against `DATABASE_URL_UNPOOLED` before
`next build`, so every deployment corresponds to an already-migrated database. Because the
Neon integration creates a database branch per Preview deployment, each preview migrates its
own branch and production data is never touched by a PR. Locally, run `npx drizzle-kit migrate`
once after pulling schema changes.

Drizzle and the migrate step are added by the first schema ticket (Members and magic link
sign-in); until then `npm run build` is just `next build`.

## Deploying

Pushing to `main` deploys to production. Every other branch and PR gets a Preview deployment
with its own Neon branch. Vercel Hobby deploys commits from any repo collaborator because the
repo is public; if Vercel comments on a PR asking for authorization, a team owner clicks it once.

Neon Free suspends its compute after 5 idle minutes, so the first request after a quiet spell
takes a few hundred milliseconds longer.

## Provisioning from scratch

[`scripts/provision-infra.sh`](scripts/provision-infra.sh) walks the commissioner through
creating the Vercel project, attaching Neon, setting the secrets, and setting up Twilio. It is
idempotent and safe to re-run.
