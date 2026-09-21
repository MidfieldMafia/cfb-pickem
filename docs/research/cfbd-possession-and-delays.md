# CFBD: possession indicator and delayed status — Research Notes

Researched 2026-09-21 for [issue #172](https://github.com/MidfieldMafia/cfb-pickem/issues/172).

Primary sources: the live OpenAPI spec at `https://api.collegefootballdata.com/api-docs.json`
(spec **v5.27.1**, fetched directly), the CFBD API's own **source code**
([CFBD/cfb-api-v2](https://github.com/CFBD/cfb-api-v2)), the CFBD **database DDL**
([CFBD/cfb-test-database `schema_dump.sql`](https://github.com/CFBD/cfb-test-database/blob/main/schema_dump.sql)),
the retired v1 API's source ([CFBD/cfb-api](https://github.com/CFBD/cfb-api)), and **live
read-only GET calls** made against CFBD with the Saturday Slate key on 2026-09-21.

**Every claim below is labelled.** `[SPEC]` = in the OpenAPI document. `[SOURCE]` = read from
CFBD's own published code or DDL. `[OBSERVED]` = seen in a real response on 2026-09-21.
`[EXTERNAL]` = secondary (sports media). `[UNVERIFIED]` = could not be established here.

> **The one thing I could not do**: observe a live game. Today is Sunday 2026-09-21 and
> `GET /scoreboard?classification=fbs` returned **75 games, all `completed`** (kickoffs
> 2026-09-17 → 2026-09-20) `[OBSERVED]`. **No FBS game was in progress**, so `possession` and
> `situation` were null on every row and I have **no first-hand observation of a populated
> `possession` value**. Everything below about its *content* is from CFBD's source and DDL,
> not from a live payload. The next live window is Thursday 2026-09-24.

---

## Summary — recommendations

| | Verdict |
|---|---|
| **(a) Possession indicator** | **Build** — but with a seam that resolves to `"home" \| "away" \| null` and shows nothing when it cannot resolve. One nullable `games` column, no new API call, no name join, no new field on `WeekStateJson` itself. |
| **(b) Delayed status** | **Don't build.** The feed has no delay signal, the inference misses the most common real case entirely (a pre-kickoff delay), and it cannot be separated from halftime, a review or a CFBD outage. |

Two incidental findings that matter more than the ticket:

1. **`/scoreboard` does not count against the monthly quota.** `[OBSERVED]` + `[SOURCE]`
   `remainingCalls` was **2872 before and 2872 after** a `/scoreboard` call, twice. CFBD's
   quota middleware lists `/scoreboard` in `ignoredPaths`. The rationale comment on
   `LIVE_REFRESH_INTERVAL_MS` in `src/lib/results/results.ts` ("about 480 calls over a
   Saturday … about 3,300 over a five-Saturday month on the 5,000-call tier") is costing us
   nothing and is **budgeting against a cost that does not exist**. See §5.
2. **We are on Tier 1 and `/live/plays` is locked.** `GET /info` reports
   `"livePlayByPlay": false`, and a `/live/plays` call returns **401 "requires a Patreon
   subscription at Tier 2 or higher"** `[OBSERVED]`. Play-by-play is not an expensive option
   for the delay inference — it is **not an option at all** without upgrading the plan.

---

## 1. What `possession` is

### 1.1 The spec says almost nothing `[SPEC]`

`ScoreboardGame.possession` is declared exactly:

```json
"possession": { "type": "string", "nullable": true }
```

No `enum`, no `description`, no `example`. `situation` and `lastPlay` are declared the same
way. The spec **does not document the value format at all**. Anyone who tells you it is
`"home"`/`"away"` is not reading the spec.

### 1.2 The API passes it straight through from one database column `[SOURCE]`

`src/app/games/scoreboard.ts` in CFBD/cfb-api-v2:

```ts
situation: row.currentSituation,
possession: row.currentPossession,
lastPlay:   row.lastPlay,
```

and `homeTeam.name` comes from a different column entirely (`row.homeTeam`, which the v1
source shows is `team.display_name` — the mascot-bearing form). So **`possession` is not
derived from, and is never compared against, the team names on the same payload.** There is
no server-side join to undo.

### 1.3 The column is `varchar(5)` — which rules out team names `[SOURCE]`

From CFBD's own DDL (`schema_dump.sql`, table `public.game`):

```sql
current_situation  character varying(20),
current_possession character varying(5)
```

**Five characters.** That is decisive and it is the single most useful fact in this document:

- It **cannot** hold `"Pittsburgh Panthers"` (19), which is the form `homeTeam.name` takes
  `[OBSERVED]`.
- It **cannot** hold most school names — `"Michigan"` is 8.
- It **can** hold `"home"` / `"away"` (4 each).
- It **can** hold a team abbreviation (`"PITT"`, `"MICH"`).
- It **can** hold a numeric team id as a string — CFBD team ids are ESPN's, and the ones on
  yesterday's board are 3–4 digits (Pittsburgh `221`, Syracuse `183`) `[OBSERVED]`.

So `possession` is one of: the side, an abbreviation, or an id. It is **not** a display name.

### 1.4 Two widely-repeated claims about the value are both unsupported

- **CFBD's own unit-test fixture** (`src/app/games/scoreboard.test.ts`) sets
  `currentPossession: 'Michigan'` `[SOURCE]`. That is **8 characters in a `varchar(5)`
  column** — the fixture is a hand-written mock that never touches the database, so it
  cannot be evidence of real content. It is wrong on its face.
- **`docs/research/collegefootballdata-api.md` in this repo** shows a `/scoreboard` sample
  with `"possession": "home"`. **That sample is invented, not observed.** The same sample
  shows `"name": "Georgia"`, but the real endpoint returns display names with mascots
  (`"Georgia Bulldogs"`, `"Pittsburgh Panthers"`) `[OBSERVED]`, and its `betting` and
  `winProbability` numbers are hand-written too. **The `"possession": "home"` line in that
  doc should not be relied on and this doc supersedes it.** It may well turn out to be
  right — but nothing has established it.

The code that writes `current_possession` is not public: an org-wide code search of `CFBD`
finds `currentPossession` only in the API repo, the API repo's test, and the generated DB
types `[SOURCE]`. CFBD's `network-importer` repo is public but contains no scoreboard or
possession code.

### 1.5 How reliably are `possession` / `situation` / `lastPlay` populated?

`[UNVERIFIED]` for in-progress games — no live game to look at.

What I can say from yesterday's completed board `[OBSERVED]`, n = 75:

| field | populated on a `completed` game |
|---|---|
| `possession` | 0 / 75 |
| `situation` | 0 / 75 |
| `lastPlay` | **71 / 75** |
| `period` | 0 / 75 (all null) |
| `clock` | 0 / 75 (all null) |

Two things follow.

- **The live fields are current-state only and are nulled on completion.** There is no
  history: `current_*` columns are overwritten in place `[SOURCE]`. So we cannot go back and
  see what the feed said during last weekend's delays — that door is closed.
- **`lastPlay` survives, and ~5% of games never got it at all.** The four blanks include
  Georgia @ Arkansas — a marquee game, not an obscure one. Whatever ingest gap produced
  those will produce gaps in `possession` too. **Any indicator must render nothing when the
  field is absent, and must not look broken when it is.**

`lastPlay` is ESPN play text and includes non-plays `[OBSERVED]`:

```
"End of 4th quarter."
"Timeout Houston, clock 00:26"
"(00:29) #25 R.Graziano kickoff 63 yards to the PSU02 fair catch by #6 C.Newman at PSU02"
"G. Lopez pass incomplete, Wake Forest Penalty, holding in the endzone for a SAFETY"
```

Note the team in a timeout is named by **short school name** ("Houston", "Delaware",
"Minnesota", "Tulane") — weak side evidence that CFBD's live text fields use short forms.

---

## 2. Proposed field shape for possession

The constraint that decides the design: **every Live Board poll reads the database only**
(`src/lib/week/poll.ts`; the feed is driven separately by the stale gate). So possession
**must land in a `games` column** to reach the wire. It cannot be computed per-poll.

### 2.1 Resolve at the seam, store the side

Add to `boardResult()` in `src/lib/results/results.ts` a **total** resolver that turns
whatever CFBD sends into a side, and yields `null` for anything it does not recognise:

```ts
/** Which side has the ball, from the scoreboard's unenumerated `possession` string.
 *  Null whenever it cannot be resolved with certainty — the board shows nothing
 *  rather than the wrong football. */
function possessionSide(board: CfbdScoreboardGame): "home" | "away" | null {
  const raw = board.possession?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "home" || raw === "away") return raw;                      // the side
  if (raw === String(board.homeTeam.id)) return "home";                  // an ESPN team id
  if (raw === String(board.awayTeam.id)) return "away";
  return null;                                                            // e.g. an abbreviation
}
```

Both branches use only fields **on the same payload row**. No name matching, no `/teams`
lookup, no second API call, no new join. An abbreviation falls through to `null`, which is
the safe failure: no indicator.

This is why the shape is safe to build despite §1.4 — we do not need to know the answer in
advance. One Saturday's worth of logged raw values tells us whether the third branch is ever
taken, and that capture costs **zero quota** (§5).

### 2.2 Database

One nullable column beside `period` and `clock`, which it behaves exactly like:

```ts
// src/db/schema.ts, games table, next to period/clock
/** Which side has the ball while a game is in progress. Null before kickoff,
 *  once final, and whenever the feed's value could not be resolved. */
possession: text("possession", { enum: ["home", "away"] }),
```

- Add to `FeedColumns` (`Pick<Game, "status" | "homeScore" | "awayScore" | "period" | "clock" | "possession">`).
- `NOT_STARTED` and the `final` branch of `boardResult` set it `null`, like `period`/`clock`.
- Add it to `sameColumns()` so a change of possession counts as the feed moving.
- `feedResult()` (the `/games` backstop) sets it `null` — `/games` has no such field `[SPEC]`.

### 2.3 Wire

**`WeekStateJson` needs no new top-level field.** Possession rides the existing `live` object:

```ts
// src/lib/results/result.ts
export interface LiveScore extends Score {
  period: number | null;
  clock: string | null;
  /** Which side has the ball right now. Null when the feed did not say, or said
   *  something we could not resolve. */
  possession: "home" | "away" | null;
}
```

`LiveScore` is already set only while a game is pending and under way and null otherwise
(`GameResult.live`), which is exactly possession's lifetime. It reaches the Live Board as
`WeekStateJson.games[].result.live.possession` through `toGameView` → `GameView` →
`RevealGame` with **no other type changes**. The console and the Reveal get it for free,
because they read the same `GameResult`.

**ETag**: `/api/week/state` digests the whole state minus `serverNow`
(`src/app/api/week/handlers.ts`). Possession changes a few dozen times per game, whereas
`clock` is rewritten on every 90-second refresh already — so this adds **no meaningful ETag
churn**. Non-issue.

### 2.4 Recommendation for (a)

**Build it**, in this order:

1. Ship the column + resolver + wire field, and `console.info` the raw `board.possession`
   whenever `possessionSide()` returns null for an `in_progress` game.
2. The board shows the football only when the value is `"home"` or `"away"`. Worst case on
   day one: no footballs appear, and the log tells us the value is an abbreviation — a
   one-line third branch, no migration, no redesign.

The alternative (wait for an observation first) costs a week and buys nothing the log does
not, because the design is already correct for all three candidate forms.

---

## 3. Delays: what the API actually offers

I checked the whole surface, not just `/scoreboard`.

### 3.1 The words do not exist anywhere `[SPEC]` `[SOURCE]`

Case-insensitive counts of `postpone`, `cancel`, `suspend`, `delay` across:

| document | occurrences |
|---|---|
| the full OpenAPI spec v5.27.1 (all 84 paths, all schemas) | **0** |
| CFBD's generated DB types `src/config/types/db.d.ts` | **0** |
| CFBD's DDL `schema_dump.sql` | **0** |

The status enum is the same three values in all three places:

```sql
CREATE TYPE public.game_status AS ENUM ('scheduled', 'in_progress', 'completed');
```

```ts
export type GameStatus = 'completed' | 'in_progress' | 'scheduled';   // db.d.ts
"GameStatus": { "enum": ["scheduled","in_progress","completed"] }      // openapi
```

This is stronger than "the API doesn't expose it": **CFBD's own database has nowhere to put
it.** A delayed status is not hidden behind a tier or an undocumented field. It does not exist.

### 3.2 Endpoint-by-endpoint

| endpoint | carries a delay signal? |
|---|---|
| `/scoreboard` | No. `status` is the 3-value enum; `period`/`clock`/`situation`/`possession`/`lastPlay` are current-state only `[SPEC]` `[SOURCE]` |
| `/games` | **Weaker than `/scoreboard`** — the `Game` schema has **no `status` field at all**, only `completed: boolean` `[SPEC]` |
| `/games` → `notes` | **No.** `notes` is `varchar(100)` `[SOURCE]`. I pulled the entire **2020** FBS regular season (the COVID year, 542 games) and got **zero non-null `notes` and zero `completed: false`** `[OBSERVED]`. Games that were cancelled in 2020 **simply are not rows** — CFBD drops them rather than marking them. `notes` is not a delay channel |
| `/live/plays` | Has `wallClock` per play, which *is* a real stall signal — but it is **401 on our key**, `"requires a Patreon subscription at Tier 2 or higher"`, and `GET /info` reports `livePlayByPlay: false` `[OBSERVED]`. Also one call **per game, per poll**, and unlike `/scoreboard` it is **metered** (`/live/plays` is commented *out* of `ignoredPaths` in CFBD's quota middleware) `[SOURCE]` |
| `/plays` | `Play.wallclock` exists `[SPEC]`, but CFBD's maintainer states per-game sub-endpoints "are updated at the conclusion of each game" ([cfb-api-v2 issue #6](https://github.com/CFBD/cfb-api-v2/issues/6)) — not live |
| `/games/teams`, `/drives`, `/calendar`, `/game/box/advanced` | No status-ish or delay field `[SPEC]`; post-game anyway |
| GraphQL | Tier 3; `graphQl: false` on our key `[OBSERVED]` |

**Conclusion: a delay can only be inferred, and only from `/scoreboard`.**

### 3.3 What the inference would have to be

`/scoreboard` gives no timestamp of last update. The only mechanism is to **remember the
previous observation per game between polls** — `(period, clock, lastPlay, scores)` plus the
wall time we saw it — and flag a game whose tuple has not moved for N minutes while
`status === "in_progress"`. That is new persistent state (another column or a jsonb blob),
written on every refresh.

**Our cadence** (`src/lib/results/results.ts`, `src/lib/week/poll.ts`):

- `LIVE_REFRESH_INTERVAL_MS = 90_000` — at most one feed call per 90s while a slate game is under way.
- `REFRESH_INTERVAL_MS = 5 * 60_000` — between games.
- Phones poll `/api/week/state` every 30s, but that **reads the database only**.
- CFBD serves `/scoreboard` from a Redis snapshot with `SNAPSHOT_TTL_SECONDS = 60` `[SOURCE]`, so the freshest possible data is up to 60s old.

90 seconds is fine-grained enough to *see* a stall. It is not the problem. The problem is
everything a stall could be.

### 3.4 Halftime, and why it cannot be told apart

`[UNVERIFIED] — no live game to observe.` What the source implies `[SOURCE]`:
`currentClock` is a Postgres `interval` and the mapper does
`String(row.currentClock).substring(3)`, so a zero clock renders `"00:00"`. Our `clockLabel()`
would print **"Q2 · 0:00"**. There is **no halftime marker** — no period `2.5`, no separate
state, nothing in the DDL.

So at halftime: `status: "in_progress"`, `period: 2`, `clock: "00:00"`, frozen ~20 minutes.
A weather delay at the end of the 2nd quarter is **byte-identical**. You can special-case
`period === 2 && clock === "00:00"` and stay silent — that failure is safe (we miss a delay)
rather than loud (we cry wolf). But it means ~20 minutes of every game is a blind spot.

`lastPlay` emits `"End of 4th quarter."` `[OBSERVED]`, so it plausibly emits `"End of 2nd
quarter."` at halftime and would be a better halftime marker than the clock `[UNVERIFIED]`.
It still says nothing about delays: ESPN does not emit a "weather delay" play.

### 3.5 The failure modes, in order of how badly they hurt

**False positives** — legitimate stoppages with a frozen clock and no new `lastPlay`:

| stoppage | rough length |
|---|---|
| between-quarter break (end of Q1/Q3) | ~2 min |
| TV / media timeout | 2–3 min |
| replay review | 2–5 min |
| injury stoppage | 3–10+ min |
| **halftime** | **~20 min** |
| **CFBD or ESPN ingest stall** | unbounded — and looks *exactly* like a delay |

That last row is not hypothetical: **4 of 75 games on yesterday's board never received a
`lastPlay` at all** `[OBSERVED]`. When the ingest drops a game, the detector reports a delay
that is not happening, at exactly the moment the board is least trustworthy.

To clear halftime you need a threshold above ~20 minutes. By then the member has been
staring at a frozen score for twenty minutes and has worked it out unaided. **The badge
arrives after it is useful and before it is trustworthy.**

**False negatives** — the bigger problem. What actually happened `[EXTERNAL]`:

| game | date | shape |
|---|---|---|
| Oregon @ Oklahoma State | 2026-09-12 | **Pre-kickoff.** Noon ET kickoff pushed to ~1:30 pm ET ([The Big Lead](https://www.thebiglead.com/oregon-oklahoma-state-weather-delay-updates-start-time/)) |
| NC State vs Richmond | 2026-09-12 | In-game, halted **mid-quarter** at 11:33 in Q2, resumed ~9:25 pm; halftime was then skipped ([Yahoo](https://sports.yahoo.com/articles/nc-state-football-weather-delay-000812881.html), [EssentiallySports](https://www.essentiallysports.com/ncaa-college-football-news-weather-delay-in-week-two-college-football-game-forces-teams-to-cancel-halftime-break-nc-state-richmond/)) |
| South Carolina vs Towson | 2026-09-12 | In-game ([Yahoo](https://sports.yahoo.com/articles/south-carolina-football-vs-towson-011135023.html)) |
| Clemson vs UNC | 2026-09-19 | In-game, halted at 8:11 in Q4 ([Yahoo](https://sports.yahoo.com/articles/lengthy-weather-delay-clemson-unc-190441207.html)). Resumed and finished — our board shows it `completed`, Clemson 28–20 `[OBSERVED]` |

**A pre-kickoff delay is completely invisible to a clock-stall detector.** The game stays
`scheduled` with `period` and `clock` null; there is no clock to stall. The Oregon case —
and any weather delay that lands before kickoff, which is a large share of them — would sail
straight past the feature we built to catch it.

### 3.6 The better inference, and why it also fails

The honest detector for the pre-kickoff case is not clock-stall at all — it is
`status === "scheduled" && now > kickoff + threshold`. Clean, cheap, needs no remembered
state, and catches the Oregon shape exactly. But it has a false positive **documented in our
own code**: `/scoreboard` is *the week being played and nothing else*, so a slate game the
board has not rolled onto yet sits `scheduled` past its kickoff for reasons that have nothing
to do with weather (see the comment on `ingestResults` in `src/lib/results/results.ts`). The
`/games` backstop fills the score in eventually, but `/games` has no in-progress status
(§3.2), so the window where we would shout "Delayed!" at a game that is being played normally
is real.

We already have the right tool for this shape: `REVIEW_AFTER_MS = 6h` → `needsReview()` →
`reviewNotice()`, which puts overdue games in front of a **commissioner**, who can look at a
TV and press Void or Override. That is the correct home for an uncertain signal: a human who
can check, not a member who cannot.

### 3.7 Recommendation for (b)

**Don't build it.** Specifically:

- **Don't** ship a "Delayed" badge from any inference. It would miss the most common real
  case (pre-kickoff), be unable to clear halftime under ~20 minutes, and fire on CFBD ingest
  gaps — which we measured at ~5% of games `[OBSERVED]`.
- The feature asks the app to make a claim about the world (*this game is delayed*) that its
  only input cannot support. A badge that is sometimes wrong about weather is worse than no
  badge, because it teaches members not to trust the board.

**Instead, two things that are true and nearly free:**

1. **Show `lastPlay` and `situation` on the Live Board.** Already on every `/scoreboard`
   payload, already typed in `src/lib/cfbd/types.ts`, zero new calls, **zero quota** (§5), no
   inference. `"3rd & 7"` plus `"Timeout Houston, clock 00:26"` answers the member's real
   question — *is anything happening?* — far better than a guessed badge, and it degrades to
   nothing when the field is absent. This is the same ingest path as possession, so it is
   close to free once §2 is built. (Caveat: `situation`'s in-progress populate rate is
   `[UNVERIFIED]`, same gap as possession.)
2. **Lean on the freshness line we already have** (`agoLabel`/`dueInLabel` in
   `src/lib/week/freshness.ts`). "Q2 · 0:00 · last play 34m ago" is a fact. "Delayed" is a guess.

If a delay badge is ever revisited, the precondition is **Tier 2 ($5/mo) plus `/live/plays`
`wallClock`** — a real timestamp of the last play instead of an absence of change. Even then
it costs one metered call per game per poll and still cannot distinguish a long injury from
lightning. Not worth $5/mo and the quota for a badge.

---

## 4. What I could not verify

1. **A populated `possession` value.** No FBS game was live on 2026-09-21. §1.3 narrows it to
   three candidate forms by column width; it does not pick one. §2.1 is designed so that we do
   not need to pick one in advance.
2. **In-progress populate rates** for `possession` and `situation`. Only `lastPlay` could be
   measured, and only on completed games (71/75).
3. **Halftime's exact representation.** Inferred from CFBD's source (§3.4), not observed.
4. **What the feed showed during the 2026-09-12 and 2026-09-19 delays.** Structurally
   unrecoverable: CFBD's `current_*` columns are overwritten in place and nulled on completion
   `[SOURCE]` `[OBSERVED]`, so there is no history to query. The delay accounts in §3.5 are
   `[EXTERNAL]` sports media, not CFBD data.

**All four close with one capture during the next live window (Thu 2026-09-24), at zero
quota cost**: log the raw `possession`, `situation`, `lastPlay`, `period`, `clock` for every
`in_progress` game on one refresh pass.

---

## 5. Quota — a correction to our own rationale

`[OBSERVED] 2026-09-21`, `GET /info` on the Saturday Slate key:

```json
{"patronLevel":1,"tierName":"Tier 1","monthlyLimit":5000,"remainingCalls":2872,
 "usedCalls":2128,"resetAt":"2026-10-01T00:00:00.000Z","sharedPool":true,
 "features":{"adjustedMetrics":true,"weather":true,"scoreboard":true,
             "livePlayByPlay":false,"graphQl":false}}
```

**`/scoreboard` is not metered.** `remainingCalls` stayed at **2872** across two `/scoreboard`
calls. CFBD's source agrees `[SOURCE]` — `src/config/middleware/quotas.ts`:

```ts
export const ignoredPaths = [
  // '/live/plays',
  // '/games/weather',
  '/scoreboard',
  '/auth/graphql',
  '/info',
  '/info/usage',
];
```

`checkCallQuotas` decrements `remaining_calls` only for paths **not** in that list. Note
`/live/plays` and `/games/weather` are commented *out* of it — both are metered.

Consequences:

- The `LIVE_REFRESH_INTERVAL_MS` doc comment in `src/lib/results/results.ts` budgets
  `/scoreboard` against the 5,000-call tier. That budget is spent on nothing. **The 90-second
  interval is free and could be tightened to 30s for live-ness alone** (CFBD's own snapshot
  TTL is 60s `[SOURCE]`, so there is little below ~60s to gain). Worth its own ticket; out of
  scope here.
- Any capture/logging pass over `/scoreboard` — including the one in §4 — costs **nothing**.
- **This is an API-side policy, not a contract.** It is not in the spec or the pricing page,
  it is in the source and in an observation. If CFBD moves `/scoreboard` out of
  `ignoredPaths`, our budget silently becomes real again. **Do not delete the rationale
  comment — annotate it.**

Separately worth flagging: `/info/usage` shows **940 requests in the trailing 7 days**, and
`usedCalls` is **2128 of 5000** with nine days left in the month `[OBSERVED]`. The metered
pressure is `/games` (165/week), `/games/weather`, `/lines` and `/metrics/wp/pregame` — the
slate builder, not the live board. Unrelated to #172, but someone should look.

---

## 6. Sources

- OpenAPI spec v5.27.1 — <https://api.collegefootballdata.com/api-docs.json>
- CFBD API source — <https://github.com/CFBD/cfb-api-v2> (`src/app/games/scoreboard.ts`, `src/app/games/scoreboard.test.ts`, `src/config/middleware/quotas.ts`, `src/config/types/db.d.ts`)
- CFBD DDL — <https://github.com/CFBD/cfb-test-database/blob/main/schema_dump.sql>
- CFBD v1 (retired) source — <https://github.com/CFBD/cfb-api> (`app/game/game.service.js`)
- CFBD update-frequency statement — <https://github.com/CFBD/cfb-api-v2/issues/6>
- Live calls 2026-09-21: `GET /scoreboard?classification=fbs`, `GET /info`, `GET /info/usage`, `GET /games?year=2020&seasonType=regular&classification=fbs`, `GET /live/plays?gameId=401858225` (401)
- Delay accounts (secondary): [The Big Lead — Oregon/Oklahoma State](https://www.thebiglead.com/oregon-oklahoma-state-weather-delay-updates-start-time/), [Yahoo — NC State/Richmond](https://sports.yahoo.com/articles/nc-state-football-weather-delay-000812881.html), [EssentiallySports — NC State/Richmond halftime skipped](https://www.essentiallysports.com/ncaa-college-football-news-weather-delay-in-week-two-college-football-game-forces-teams-to-cancel-halftime-break-nc-state-richmond/), [Yahoo — South Carolina/Towson](https://sports.yahoo.com/articles/south-carolina-football-vs-towson-011135023.html), [Yahoo — Clemson/UNC](https://sports.yahoo.com/articles/lengthy-weather-delay-clemson-unc-190441207.html)
- Prior repo research: `docs/research/collegefootballdata-api.md` (its `"possession": "home"` sample is superseded by §1.4)
