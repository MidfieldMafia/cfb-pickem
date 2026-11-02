# A heartbeat for live work when nobody has the app open

Research date: 2026-11-02. Resolves [#523](https://github.com/MidfieldMafia/cfb-pickem/issues/523),
a sub-issue of the [v5 app map](https://github.com/MidfieldMafia/cfb-pickem/issues/491).

**Question.** What should call the score update about once a minute during game windows, so live
work (score updates, the close-game push, anything later) runs when no member has the app open?

Sources are first-party docs and pricing pages (Vercel, Upstash, cron-job.org, GitHub,
Cloudflare, Fly.io, Render, Railway, Neon), read on 2026-11-02, and this repo's own code.

## Recommendation

**Upstash QStash schedules, on the free plan, calling a new `/api/cron/live` with
`Authorization: Bearer $CRON_SECRET` forwarded.** It is free inside the game windows, minute-
resolution, comes in through the Vercel Marketplace, keeps a delivery log, and fits the existing
`authorized()` check without a line changed. If the 1,000-a-day cap ever bites, Pay as You Go
costs about $0.12 a month at this volume.

**Runner-up: a Cloudflare Worker with Cron Triggers** (free, 100,000 requests a day, five
triggers). Choose it if a separate Cloudflare account and a tiny Worker outside this repo's
deploy are acceptable and the QStash cap is not.

**Fallback: cron-job.org.** Free, every minute, custom headers, but "no promise or guarantee on
punctuality" and a 30 s timeout.

Whichever one calls it, **the pings must stay inside game windows**, not run every minute all
week: each ping reads the database, and Neon Free suspends after five idle minutes and allows
100 CU-hours a month (see [Neon keeps the windows honest](#neon-keeps-the-windows-honest)).

## What the endpoint is

The route is the same shape as `src/app/api/cron/refresh-slates/route.ts`: `authorized(request)`
from `src/app/api/cron/auth.ts`, then the gated update `refreshResultsIfStale`
(`src/lib/results/writes.ts`). The gate claims `weeks.scoreboard_fetched_at` atomically and holds
for `LIVE_REFRESH_INTERVAL_MS = 30_000` while a game is live (`REFRESH_INTERVAL_MS = 5 * 60_000`
between games), so:

- A ping while members are polling usually loses the claim and does nothing but one read.
- A ping when nobody is polling does the work at most once a minute, which spends fewer
  `/live/plays` calls than member polling at 30 s does. The CFBD budget in `writes.ts` is
  unchanged.
- A pass is bounded by `LIVE_PLAYS_PASS_BUDGET_MS = 10_000` plus one call, well inside every
  caller's timeout below (cron-job.org's 30 s is the tightest).
- QStash sends **POST** by default (`Upstash-Method` defaults to POST,
  [create a schedule](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule)).
  Either export `POST` as well as `GET` from the route, or set `Upstash-Method: GET` on the
  schedule. A `route.ts` may export only handlers (CLAUDE.md), so that is all it adds.

## The windows

Per-minute pings over these UTC windows cover every kickoff in Eastern time, both sides of the
DST change, with margin:

| Schedule | Cron (UTC) | Pings on that day |
| --- | --- | --- |
| Saturday day | `* 15-23 * * 6` | 540 |
| Saturday night, into Sunday | `* 0-8 * * 0` | 540 |
| Weeknight evenings (Tue–Fri) | `* 23 * * 2-5` | 60 |
| Weeknight late (Wed–Sat) | `* 0-4 * * 3-6` | 300 |

The busiest UTC day is Saturday: 540 + 300 (Friday night's late games) = **840 pings**. Sunday is
540. About 2,800 a week, about 12,000 a month. A game outside these windows still updates from
member traffic, as today.

## The options

### 1. Vercel Pro (per-minute crons)

- **Cost:** $20 a month per Developer seat, with a $20 included usage credit
  ([vercel.com/pricing](https://vercel.com/pricing)). The only option that costs real money every
  month, including the off-season.
- **Reliability:** Pro and Enterprise: minimum interval "Once per minute", precision "Per-minute"
  ([cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). The best
  timing on the list.
- **Setup:** one `vercel.json` entry; Vercel Cron already sends `Bearer $CRON_SECRET`, so
  `authorized()` works as is. Windows go straight into the cron expression.
- **Why not:** today Hobby is limited to "Once per day" with precision "Per-hour (±59 min)", and
  a more frequent expression "will fail during deployment" (same page). $240 a year for one ping
  is the wrong trade when three free callers exist.

### 2. Upstash QStash schedules (recommended)

- **Cost:** Free plan, $0: **1,000 messages a day**, **10 active schedules**, max HTTP response
  duration 15 minutes. Pay as You Go: **$1 per 100K messages**, unlimited per day. "One delivery
  attempt to one endpoint equals one billed message", so retries count against the cap
  ([pricing](https://upstash.com/pricing/qstash)).
- **Fit with the cap:** the windows above peak at 840 a day, so the free plan holds with 160 to
  spare, provided retries are off (`Upstash-Retries: 0`; the default is 3,
  [create a schedule](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule)).
  The next minute's ping is the retry. Four schedules of ten. Under Pay as You Go the same
  12,000 a month is about $0.12, and even every minute all month (43,200) is $0.43.
- **Reliability:** "The maximum schedule resolution is 1 minute"; "It can take up to 60 seconds
  for the schedule to be loaded on an active node and triggered for the first time"
  ([schedules](https://upstash.com/docs/qstash/features/schedules)). Upstash publishes no
  lateness figure for steady-state firing. Against the 2-minute close-game window, one late or
  dropped ping costs one minute, and member polling still runs alongside.
- **Setup:** install Upstash from the [Vercel Marketplace](https://vercel.com/marketplace/upstash)
  (the listing includes "Upstash QStash/Workflow" and "will set the required environment
  variables"), then create four schedules in the console or with one `curl` each.
- **Auth:** headers prefixed `Upstash-Forward-` reach the destination with the prefix removed
  ([publishing](https://upstash.com/docs/qstash/howto/publishing)), so
  `Upstash-Forward-Authorization: Bearer <CRON_SECRET>` arrives as the header `authorized()`
  already checks. The secret is then stored in Upstash as well as Vercel. QStash's own request
  signature (`Upstash-Signature`) is an alternative that keeps the secret out of Upstash, at the
  cost of a dependency and a second auth path; not needed.
- **Timezone:** UTC by default, `CRON_TZ=` prefix available (schedules page). UTC is simpler here
  because `writes.ts` and the windows are already in UTC.

### 3. cron-job.org (fallback)

- **Cost:** "Our service is entirely free of charge" ([FAQ](https://cron-job.org/en/faq/)).
- **Reliability:** "up to 60 times an hour, i.e. every minute", but "We cannot give a promise or a
  guarantee on punctuality"; peak-hour delays happen, and jobs that keep failing or run long
  "may be deliberately delayed". Requests time out after 30 seconds and only 64 KB of the
  response is read (same FAQ). A volunteer-run service with a fair-use clause.
- **Setup:** a web form; "arbitrary custom headers" are supported, so the `Authorization` header
  goes in directly. A REST API exists ([docs](https://docs.cron-job.org/)).
- **Why not first:** no stated punctuality, no delivery log tied to the Vercel project, and the
  30 s cut-off is only 3× the pass budget. It is the right spare if QStash ever fails us.
  (`sms-provider-and-reminders.md` named it for reminders; the reminder cron stayed on Vercel.)

### 4. A Vercel Workflow started by the daily job

A run started from `/api/cron/refresh-slates` on game days that loops `step(refresh)` →
`sleep("1m")` until every game is final.

- **Cost on Hobby:** 50,000 Workflow Events a month and 1 GB Data Written included; Data
  Retained "is not available on Hobby" ([Workflow pricing](https://vercel.com/docs/workflows/pricing)).
  A step writes three events (`step_created`, `step_started`, `step_completed`) and a sleep two
  (`wait_created`, `wait_completed`) ([event sourcing](https://workflow-sdk.dev/docs/how-it-works/event-sourcing)),
  so about 5 events a minute: ~4,500 on a 15-hour Saturday, ~20,000+ a month with weeknights.
  Inside the allowance, but Hobby "cannot purchase additional usage"
  ([vercel.com/pricing](https://vercel.com/pricing)), so a bad loop stops at the cap. Steps run
  as ordinary Functions (Hobby: 1M invocations, 4 h Active CPU, 360 GB-hrs memory,
  [functions pricing](https://vercel.com/docs/functions/usage-and-pricing)) and orchestration
  uses Queues (Hobby: first 1,000,000 operations, [Queues pricing](https://vercel.com/docs/queues/pricing)).
- **Limits:** no maximum run or sleep duration, but 25,000 events per run, and "runs that exceed
  2,000 events ... can have slower replay times" with a 240 s maximum replay (Workflow pricing).
  A Saturday run passes 2,000 events by mid-afternoon, so it would need child workflows or a
  fresh run every few hours.
- **Reliability:** the start depends on the Hobby daily cron, which fires anywhere in its hour
  (±59 min); at 12:00 UTC that is still before the earliest window. Sleep precision is not
  documented. It is self-windowing (stops when the games are final), which is its one real
  advantage.
- **Setup:** a new `workflow` dependency, its build integration, a workflow file, a start call,
  and a new runtime model to debug on a Saturday. Auth needs nothing: the run is started from
  inside an already-authorized cron.
- **Why not:** the most code and the most new failure modes, for something an outside ping does
  with a schedule.

### 5. A small cron app of our own

Something that runs continuously and calls `/api/cron/live` every minute.

- **Cloudflare Workers Cron Triggers (runner-up).** Free plan: 100,000 requests a day, **5 Cron
  Triggers per account**, 10 ms CPU per Cron Trigger (waiting on `fetch` is not CPU), 15 min
  wall-clock ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
  `* * * * *` is a documented example; changes "may take ... up to 15 minutes to propagate", and
  triggers run on UTC ([Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)).
  No punctuality figure is published. The four windows fit in five triggers. Setup: a Cloudflare
  account, a ten-line Worker, `wrangler secret put CRON_SECRET`, `wrangler deploy`. Free and
  uncapped for this use, but it is code and an account outside this repo's deploy and review.
- **Fly.io.** "New organizations don't have a free tier or a monthly free usage allowance"; the
  smallest shared-cpu-1x 256 MB Machine is **$2.19 a month** running continuously
  ([pricing](https://docs.fly.io/about/pricing)). Cheap and precise (our own `setInterval` or
  cron in a container), but a container, a Dockerfile and a bill for a curl loop.
- **Render.** Free instances exist only for web services, Postgres, Key Value and static sites;
  "Other service types don't support Free instances", and a free web service spins down after
  15 minutes without inbound traffic ([free](https://render.com/docs/free)). Cron jobs have "a
  minimum monthly charge of $1 per cron job service", billed per second of run time
  ([cron jobs](https://render.com/docs/cronjobs)); a container start every minute is the wrong
  shape. Not a fit.
- **Railway.** Cron schedules must be "at least 5 minutes apart" and Railway "does not guarantee
  execution times to the minute" ([cron jobs](https://docs.railway.com/reference/cron-jobs)).
  An always-on service instead needs the Hobby plan, $5 a month with $5 of usage included; the
  Free plan is $1 of credit a month ([plans](https://docs.railway.com/reference/pricing/plans)).
  Native cron is out; an always-on loop costs $5 a month.
- **A home machine** (`launchd` or `cron` running `curl`). Free and per-minute, but it stops when
  the laptop sleeps or the network drops, as a laptop left running a Saturday field check already has. Fine for
  a one-off Saturday measurement, not as the heartbeat.

### 6. GitHub Actions `schedule` (as expected, no)

"The shortest interval you can run scheduled workflows is once every 5 minutes"; "The `schedule`
event can be delayed during periods of high loads"; and this repo is **public**, where "scheduled
workflows are automatically disabled when no repository activity has occurred in 60 days"
([events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
The off-season would switch it off. Ruled out on interval alone.

## Comparison

| Option | Cost a month | Interval and lateness | Setup | `CRON_SECRET` fit |
| --- | --- | --- | --- | --- |
| Vercel Pro cron | $20 per seat | 1 min, per-minute precision | One `vercel.json` line | Native |
| **QStash (free)** | **$0** (≤1,000/day; PAYG ~$0.12) | 1 min; first fire ≤60 s; no steady-state figure | Marketplace install + 4 schedules | `Upstash-Forward-Authorization` |
| cron-job.org | $0 | 1 min; no punctuality promise; 30 s timeout | Web form | Custom header |
| Vercel Workflow | $0 inside 50k events, hard cap | ~1 min; starts ±59 min via Hobby cron | New dependency + workflow code | Started from inside a cron |
| Cloudflare Worker cron | $0 | 1 min; no published lateness | Account + Worker + wrangler | Worker secret |
| Fly.io machine | ~$2.19 | Whatever we write | Container + deploy | Env secret |
| Render cron | ≥$1 per job + run time; no free cron | Container per run | Container | Env secret |
| Railway | $5 (always-on); cron ≥5 min | Cron ±minutes | Container | Env secret |
| Home machine | $0 | Stops when it sleeps | `launchd` + `curl` | Local file |
| GitHub Actions | $0 | ≥5 min, delayed; disabled after 60 idle days | Workflow YAML | Repo secret |

## Neon keeps the windows honest

The project is on Neon Free (`vercel-neon-nextjs-constraints.md` §3): **100 CU-hours per project
a month**, scale-to-zero after "5 min inactivity; cannot disable", and past the allowance "your
compute is suspended until the next billing period or until you upgrade"
([Neon plans](https://neon.com/docs/introduction/plans)).

A ping every minute, all week, would keep the compute awake around the clock: 720 hours at
0.25 CU is about 180 CU-hours, past the cap, and the app would go dark late in the month. The
windows above keep it awake about 25 hours a week at most (Saturday 15:00 to Sunday 09:00 plus
the weeknights), roughly 25–30 CU-hours a month on top of normal use. This holds whichever caller
is chosen, and it is why "just ping every minute, the endpoint will no-op" is the wrong default.

## Not checked

- Whether QStash or Cloudflare publish any steady-state lateness figure; neither page does.
- Whether the Upstash Marketplace install bills through Vercel or Upstash; the listing does not
  say. Irrelevant on the free plan.
- The Neon plan was taken from `vercel-neon-nextjs-constraints.md`, not rechecked in the console.
