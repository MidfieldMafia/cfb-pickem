# Scheduled work: the crons and the live heartbeat

Every scheduled route lives under `src/app/api/cron/` and refuses anything without
`Authorization: Bearer $CRON_SECRET` (`src/app/api/cron/auth.ts`) before doing any work.

| Route | Caller | When |
| --- | --- | --- |
| `/api/cron/refresh-slates` | Vercel Cron (`vercel.json`) | daily, 12:00 UTC |
| `/api/cron/remind` | Vercel Cron (`vercel.json`) | daily, 16:00 UTC |
| `/api/cron/live` | Upstash QStash schedules | every minute, in each published Game's window |

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

### When it pings: the published Slate's windows

QStash pings only around the published Slate's Games (#546), from
`heartbeatWindows` in `src/lib/results/heartbeat-windows.ts`:

- **Each Game's window** runs from its kickoff hour to five hours after kickoff, in UTC. The
  longest game this season ran 4.0 hours from kickoff to its last play (median 3.3, p90 3.8).
  Void Games are skipped, and so is a window already over.
- **Overlapping windows merge**, and a window that crosses midnight UTC splits into one schedule
  per UTC date.
- **Each schedule pins its date**, and its id names it: Week 10 (Saturday 17:00 to 00:30 UTC
  kickoffs) is `slate-live-2026-11-07` at `* 17-23 7 11 *` and `slate-live-2026-11-08` at
  `* 0-5 8 11 *`. A date whose hours are all over drops out.
- **A day with no Game has no schedule**, and neither does the off-season.

That week is 13 hours, 780 pings, where the four fixed windows it replaced (Saturday 15:00 to
08:59 UTC and four weeknights 23:00 to 04:59) sent 2,520 a week all year. QStash is on **Pay as
You Go** ($1 per 100,000 messages, no daily cap): the Free plan sold through the Vercel
Marketplace allows only 500 a day, and a full Saturday window passes that. Retries are off
(`Upstash-Retries: 0`): each delivery is billed, and the next minute's ping is the retry.

**What it costs is Neon, not QStash.** The compute is 0.25 CU with scale-to-zero after 5 idle
minutes, so a ping a minute keeps it awake for the whole window. The fixed windows were 42 awake
hours a week, about 46 CU-hours a month against Neon Free's 100 (the research's "about 25 hours"
was wrong); Week 10's windows are 13 hours. A game still running past its window updates from
member traffic, as before.

### Keeping the schedules in step

The schedules live in QStash, not in this repo's deploy. `syncHeartbeat`
(`src/lib/results/heartbeat-sync.ts`) lists the schedules on `/api/cron/live`, creates or
replaces the wanted ones by id, and only then deletes every other schedule there: dates already
past, since a date-pinned cron fires again next year, and anything else on that destination.
Each forwards the secret as `Upstash-Forward-Authorization`, which QStash delivers as the
`Authorization` header `authorized()` checks. A call that fails stops the sync where it is and
logs it, so nothing is deleted before its replacements exist. It never prints `CRON_SECRET` or
`QSTASH_TOKEN`.

It runs:

- **daily from `/api/cron/refresh-slates`**, after `refreshUpcomingSlates`, so a kickoff the feed
  moved or a TBD that got set is caught by 12:00 UTC. Its result is the response's `heartbeat`.
- **after the slate console's publish, add game, remove game and Refresh**, in `after()`, so a
  QStash problem never fails the commissioner's edit.

Only production syncs (`VERCEL_ENV === "production"`), and the target is always
`https://slate.midfield-mafia.com`, never a deployment URL: otherwise every preview and local
session that publishes a slate would rewrite production's schedules. It needs `QSTASH_TOKEN`,
`QSTASH_URL` and `CRON_SECRET` on Production; without the first or last it logs
`Heartbeat sync skipped` and changes nothing.

### Running it by hand

`scripts/qstash-schedules.mts` runs the same sync against production's published Slate. **Re-run
it after rotating `CRON_SECRET`**, or every ping answers 401, and after a failed sync (the Vercel
logs say `Heartbeat sync failed`).

**`vercel env pull` can't supply most of it.** `QSTASH_TOKEN`, `QSTASH_URL`, both QStash signing
keys and `CRON_SECRET` are Sensitive on Production, so the pull writes `[SENSITIVE]` in place of
each value. Only `DATABASE_URL` comes through. A placeholder passed to the script fails as a bad
token, or as `CRON_SECRET is not set`. Take each value from where it really lives:

| Variable | From |
|---|---|
| `DATABASE_URL` | `npx vercel env pull --environment=production`, the one real value it writes |
| `QSTASH_TOKEN`, `QSTASH_URL` | the Upstash console: Vercel → Storage → cfb-pickem-qstash → Open in Upstash → QStash, the token and URL on its details page |
| `CRON_SECRET` | `.env.local`, see below |
| `HEARTBEAT_BASE_URL` | optional; defaults to `https://slate.midfield-mafia.com` |

```bash
npx vercel env pull --environment=production .env.prod.tmp
grep '^DATABASE_URL=' .env.prod.tmp > .env.qstash   # gitignored by .env*
rm .env.prod.tmp
grep '^CRON_SECRET=' .env.local >> .env.qstash
# Add QSTASH_TOKEN=... and QSTASH_URL=... from the Upstash console, then check none is a placeholder:
grep -c SENSITIVE .env.qstash   # must print 0
npx tsx --conditions=react-server --env-file=.env.qstash scripts/qstash-schedules.mts
rm .env.qstash
```

Run these in a terminal, or one line at a time with Claude Code's `!`. Don't paste them as one
block with a `!` before each line: inside the block, a leading `!` negates that command's result,
so anything chained after it with `&&` is skipped. On 2026-11-06 that skipped the `rm` and left
`.env.prod.tmp`, which holds production's `DATABASE_URL`, behind.

`CRON_SECRET` is stored in Vercel as Sensitive, so the dashboard never shows it. Production,
Preview and Development share one value (`scripts/provision-infra.sh`), so the copy in
`.env.local` is the production secret. Prove it first: the `curl` under
[Checking it](#checking-it) with that value answers 200, not 401. The script prints each schedule
it created, replaced or deleted, and exits 1 on a failed sync.

### Checking it

The QStash console (Vercel → Storage → cfb-pickem-qstash → Open in Upstash) lists the
schedules, which should be this week's `slate-live-<date>` ones and nothing else. Its delivery log
shows each ping's status and duration only, not the response body. The body is in the reply to a
ping by hand: `"refreshed": true` during a game means the heartbeat pulled the feed; `"fresh"`
means a member (or the last ping) already had; `"idle"` means nothing was under way. By hand:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://slate.midfield-mafia.com/api/cron/live
```
