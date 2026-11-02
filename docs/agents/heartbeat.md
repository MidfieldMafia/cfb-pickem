# Scheduled work: the crons and the live heartbeat

Every scheduled route lives under `src/app/api/cron/` and refuses anything without
`Authorization: Bearer $CRON_SECRET` (`src/app/api/cron/auth.ts`) before doing any work.

| Route | Caller | When |
| --- | --- | --- |
| `/api/cron/refresh-slates` | Vercel Cron (`vercel.json`) | daily, 12:00 UTC |
| `/api/cron/remind` | Vercel Cron (`vercel.json`) | daily, 16:00 UTC |
| `/api/cron/live` | Upstash QStash schedules | every minute, in game windows |

Vercel Hobby runs a cron at most once a day, to the hour. That is why the live heartbeat
has an outside caller; the choice is in `docs/research/live-heartbeat.md` on the
`research/live-heartbeat` branch ([#523](https://github.com/MidfieldMafia/cfb-pickem/issues/523)).

## The live heartbeat

Without it, scores and Finals move only while a member has the app open: `refreshResultsIfStale`
(`src/lib/results/writes.ts`) runs from `/api/week/state` and the Leaderboard. `/api/cron/live`
runs the same gate for the published Week (`src/lib/results/heartbeat.ts`) and answers
`{ week, refreshed, outcome }`. A ping inside the 30 s claim does nothing but one read, so
member polling and the heartbeat never pull the feed twice. It exports `GET` and `POST`:
QStash sends POST.

### The four windows (UTC)

| Schedule id | Cron | Pings that day |
| --- | --- | --- |
| `slate-live-saturday-day` | `* 15-23 * * 6` | 540 |
| `slate-live-saturday-night` | `* 0-8 * * 0` | 540 |
| `slate-live-weeknight-evening` | `* 23 * * 2-5` | 60 |
| `slate-live-weeknight-late` | `* 0-4 * * 3-6` | 300 |

The busiest UTC day is Saturday, 540 + 300 = 840. QStash is on **Pay as You Go** ($1 per
100,000 messages, no daily cap; about $0.12 a month at this volume): the Free plan sold
through the Vercel Marketplace allows only 500 a day, not the 1,000 Upstash's own pricing page
lists. Retries are off (`Upstash-Retries: 0`): each delivery is billed, and the next minute's
ping is the retry.

**Keep the pings inside game windows.** Each ping reads Neon, and one a minute all week would
spend about 180 CU-hours a month against Neon Free's 100. A game outside the windows still
updates from member traffic, as before.

### Creating or changing the schedules

The schedules live in QStash, not in this repo's deploy. `scripts/qstash-schedules.mts` makes
them match the table: it lists what is there, replaces a schedule with the same destination and
cron in place, creates the missing ones, and deletes any other schedule on the same destination.
Running it twice leaves four.

```bash
# .env.qstash (gitignored by .env*):
#   QSTASH_TOKEN=...          Vercel env vars (the Marketplace integration) or the Upstash console
#   QSTASH_URL=...            optional; the regional endpoint the integration sets
#   CRON_SECRET=...           copy the line from .env.local, see below
#   HEARTBEAT_BASE_URL=...    optional; defaults to https://slate.midfield-mafia.com
grep '^CRON_SECRET=' .env.local >> .env.qstash
npx tsx --env-file=.env.qstash scripts/qstash-schedules.mts
rm .env.qstash
```

`CRON_SECRET` is stored in Vercel as Sensitive, so the dashboard never shows it. Production,
Preview and Development share one value (`scripts/provision-infra.sh`), so the copy in
`.env.local` is the production secret. Prove it first: the `curl` under
[Checking it](#checking-it) with that value answers 200, not 401.

It forwards the secret as `Upstash-Forward-Authorization`, which QStash delivers as the
`Authorization` header `authorized()` checks, and never prints it. **Re-run it after rotating
`CRON_SECRET`**, or every ping answers 401. To change a window, edit `WINDOWS` in the script and
this table together, then re-run.

### Checking it

The QStash console's delivery log shows each ping's status and body. A 200 with
`"refreshed": true` during a game means the heartbeat pulled the feed; `"fresh"` means a member
(or the last ping) already had; `"idle"` means nothing was under way. By hand:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://slate.midfield-mafia.com/api/cron/live
```
