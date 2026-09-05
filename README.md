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
npm run migrate                  # apply committed migrations to the Development database
npm run seed                     # 2026 season + commissioners; prints their Magic Links
npm run dev                      # http://localhost:3000
```

`.env.local` is gitignored. Re-run `vercel env pull` whenever a variable changes in Vercel.
Never commit secrets; they live only in Vercel.

## Environment variables

Managed in Vercel (Production, Preview, Development). Pull them locally with `vercel env pull`.

| Variable | Source | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration (Production, Preview); set by hand for Development | Pooled connection for request-time queries (`drizzle-orm/neon-http`) |
| `DATABASE_URL_UNPOOLED` | Neon integration (Production, Preview); set by hand for Development | Direct connection for migrations |
| `CFBD_API_KEY` | CollegeFootballData account | Game schedules and scores |
| `CRON_SECRET` | Generated | Bearer token required by scheduled route handlers |
| `NEXT_PUBLIC_APP_URL` | Set by hand | Absolute URL used in magic links and texts. Production: `https://slate.midfield-mafia.com`. Development: `http://localhost:3000`. Unset in Preview; code should fall back to `https://${VERCEL_URL}` |
| `PINGRAM_API_KEY` | Pingram dashboard | Sends text messages (free tier, 100 SMS a month) |

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
own branch and production data is never touched by a PR. Locally, run `npm run migrate`
once after pulling schema changes.

Neon branches: `main` is production. Vercel creates `preview/<git-branch>` per Preview
deployment and injects that branch's connection string into the deployment only. The
`development` branch backs the Vercel Development environment, so `.env.local`, `npm run
migrate`, and `npm run seed` never touch production. Its two connection strings are set by
hand in Vercel (Development only) because the integration serves only Production and Preview.

`npm run migrate` is the same command with the config's `.env.local` fallback, for local use.

## Building a week's slate

Commissioners build each week at `/console/slate`. The page reads that week's FBS games,
the latest AP poll, and sportsbook spreads from CollegeFootballData (three calls, cached
in process for ten minutes; "Refresh from feed" bypasses the cache and re-reads kickoffs
for games already on the slate). Filter to ranked or SEC games, add about ten, flag one
as the Tiebreaker Game. The Deadline floats at the earliest kickoff until publish and can
only be moved earlier. Publishing freezes the Deadline and shows the slate to members at
`/week`; after that a game can only be voided, with a note, never removed. Kickoff times
render in each viewer's own time zone.

The CollegeFootballData client lives in `src/lib/cfbd/`. Tests never call the real API:
they replay the recorded Week 2 2026 responses in `src/lib/cfbd/fixtures/`.

## Seeding and signing in

There are no passwords. Each member has a permanent Magic Link (`/m/<token>`); opening it sets
a year-long httpOnly session cookie and lands on the welcome page the first time, the current
week after that. Commissioners add members and copy, regenerate, or deactivate links at
`/console/members`. Regenerating or deactivating signs that member out everywhere.

Seed the 2026 season and the two commissioners, and print their Magic Links:

```bash
npm run seed                                                       # Development database (.env.local)
npx vercel env pull --environment=production .env.production.local # once, for production
npx tsx --env-file=.env.production.local scripts/seed.ts           # production database
```

The seed is idempotent: re-running prints the existing links. `SEED_JONAH_PHONE` and
`SEED_ALEX_PHONE` set phone numbers on first creation.

## Deploying

Production is [slate.midfield-mafia.com](https://slate.midfield-mafia.com). The domain is
registered at GoDaddy; an A record for `slate` points at Vercel (`76.76.21.21`) and the apex is
left free for other Midfield Mafia projects. The `cfb-pickem-eight.vercel.app` URL keeps working
as an alias.

Pushing to `main` deploys to production. Every other branch and PR gets a Preview deployment
with its own Neon branch. Vercel Hobby deploys commits from any repo collaborator because the
repo is public; if Vercel comments on a PR asking for authorization, a team owner clicks it once.

Neon Free suspends its compute after 5 idle minutes, so the first request after a quiet spell
takes a few hundred milliseconds longer.

## Provisioning from scratch

[`scripts/provision-infra.sh`](scripts/provision-infra.sh) walks the commissioner through
creating the Vercel project, attaching Neon, setting the secrets, and creating the Pingram account. It is
idempotent and safe to re-run.
