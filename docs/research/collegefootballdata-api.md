# CollegeFootballData API — Research Notes

Researched 2026-09-04 against primary sources only: the live OpenAPI spec served at
`https://api.collegefootballdata.com/api-docs.json` (spec v5.26.0, fetched directly),
[collegefootballdata.com](https://collegefootballdata.com/) pricing pages, the official CFBD
blog, the official `cfbd` npm package + GitHub repo, the legacy `cfb.js` client's docs, and
the `CFBD/cfb-api-v2` GitHub issue tracker. Unverifiable claims are stated as such below,
never guessed.

## Summary — actionable recommendations

- **Auth**: send `Authorization: Bearer <CFBD_API_KEY>` on every request, server-side only —
  never ship the key to the browser (CFBD's own explicit guidance).
  ([using-api-keys blog](https://radsportsanalytics.com/blog/using-api-keys-with-the-cfbd-api/))
- **Base URL**: use `https://api.collegefootballdata.com` — the canonical v2 host per the
  live OpenAPI spec's `servers` entry. `apinext.collegefootballdata.com` now just redirects
  to the docs site (`/getting-started`), it isn't a separate API to build against.
  ([openapi.json `servers`](https://api.collegefootballdata.com/api-docs.json))
- **Live scores**: poll `GET /scoreboard` (not `/games`) — one call returns every current FBS
  game at once (filterable only by `classification`/`conference`, no per-game calls needed).
  Poll every 2–3 minutes during the Saturday live window and back off once every tracked
  game's `status` is `completed`. ([openapi.json](https://api.collegefootballdata.com/api-docs.json))
- **Slate building / grading backstop**: use `GET /games` with `year`+`week`+`seasonType` for
  the week's games and final `homePoints`/`awayPoints`; key off numeric `id`, not team names.
- **Defend against missing statuses**: `/games` only has a boolean `completed` field (no
  status enum); `/scoreboard`'s `status` enum is only `scheduled` / `in_progress` /
  `completed` — CFBD documents no explicit "postponed" or "canceled" value anywhere in the
  spec. Treat a game still not `completed` long after scheduled kickoff (or whose
  `clock`/`period` stop advancing while `in_progress`) as needing manual commissioner review.
- **Join on numeric IDs only**: `Game.id`/`ScoreboardGame.id`/`BettingGame.id` are the shared
  game identity; `Team.id`, `homeId`/`awayId`, `homeTeamId`/`awayTeamId`, and `PollRank.teamId`
  are the shared team identity. School-name strings on `/games`/`/scoreboard` aren't
  guaranteed to exactly match `Team.school`, and `Team.mascot`/`abbreviation`/`alternateNames`
  are all nullable — build one `id → display name/logo` lookup from `/teams` per season.
- **Client library**: use the official `cfbd` npm package (generated from this same OpenAPI
  spec, published in lockstep with the live API — v5.26.0 both places at fetch time). Do
  **not** use the older `cfb.js`; it targets the retired v1 API with diverged field names
  (e.g. `Team.altName1/2/3` vs v2's single `alternateNames` array).
- **Quota headroom**: Tier 1 ($1/mo) = 5,000 calls/month
  ([api-tiers](https://collegefootballdata.com/api-tiers)). A ~10-hour Saturday live window
  polled every 2 minutes is only ~300 `/scoreboard` calls; even a 60-second interval all day is
  only ~600 — both leave thousands of calls/month for slate-building, rankings, and lines
  look-ups on the other ~29 days.
- **Betting lines**: `provider` is free text with no enumerated list in the spec — don't
  hardcode a sportsbook name; fetch `/lines` and read back whatever `provider` values are
  actually present (only `"Bovada"` was directly verifiable from a primary CFBD example here).

---

## 1. Auth and rate limits

- **Auth mechanism**: Bearer token in the `Authorization` header. The spec's own security
  scheme: `{"apiKey": {"type": "http", "scheme": "bearer", "description": "CollegeFootballData
  API key supplied as a bearer token."}}`
  ([openapi.json `components.securitySchemes`](https://api.collegefootballdata.com/api-docs.json)).
  Confirmed again in the getting-started page's curl example:
  `--header "Authorization: Bearer ${CFBD_API_KEY}"` ([api.collegefootballdata.com/](https://api.collegefootballdata.com/)).
  The CFBD blog explicitly warns to "load the key from an environment variable or another
  server-side secret store; never commit it to source control, log it, paste it into public
  examples, or expose it in browser/client-side code."
  ([using-api-keys blog](https://radsportsanalytics.com/blog/using-api-keys-with-the-cfbd-api/),
  redirected from `blog.collegefootballdata.com`, CFBD's own blog).
- **Monthly quotas by tier**, from the pricing page
  ([collegefootballdata.com/api-tiers](https://collegefootballdata.com/api-tiers)):
  | Tier | Price | Calls/month | Adds vs. tier below |
  |---|---|---|---|
  | Free | $0 | 1,000/mo | Basic endpoints, historical data, stats, recruiting, betting lines, advanced metrics (EPA/PPA/WP) |
  | Academic | $0 (.edu) | 3,000/mo | Same as Free |
  | **Tier 1** | **$1/mo** | **5,000/mo** | **Opponent-adjusted metrics, weather data, live scoreboard** |
  | Tier 2 | $5/mo | 30,000/mo | + Live play-by-play |
  | Tier 3 | $10/mo | 75,000/mo | + GraphQL API |
  | Tier 4 | $15/mo | 125,000/mo | same features as Tier 3 |
- **What the $1 tier unlocks**: per the page, Tier 1 is the first tier to add
  **"Opponent Adjusted Metrics," "Weather Data,"** and **"Live Scoreboard"** ("Real-time game
  scores and updates") on top of Free/Academic. Live play-by-play and GraphQL are gated
  behind higher ($5+/$10+) tiers, not Tier 1. ([collegefootballdata.com/api-tiers](https://collegefootballdata.com/api-tiers))
- **Per-minute/per-second rate limits**: none. CFBD's own post announcing the v2 GA states:
  "there is no request throttling in REST API v2. This was done in favor of monthly limits to
  make things more transparent and easier to communicate and implement."
  ([API v2 GA blog post](https://radsportsanalytics.com/blog/api-v2-is-now-in-general-availability/),
  redirected from `blog.collegefootballdata.com`). The same post gives the v2 timeline: REST
  API v2 launched publicly in January 2025, both `api.` and `apinext.` hostnames pointed at v2
  by May 2025, and the v1 API was shut down prior to the 2025 season.

## 2. Endpoints and key fields

All field names below are taken directly from the live OpenAPI spec
(`https://api.collegefootballdata.com/api-docs.json`, spec version 5.26.0), not from blog
examples, unless noted.

### (a) `GET /games` — season/week game list

Response is an array of `Game`. Key fields (trimmed to the relevant subset):

```json
{
  "id": 401520145, "season": 2023, "week": 1, "seasonType": "regular",
  "startDate": "2023-08-26T16:00:00.000Z", "startTimeTBD": false,
  "completed": true, "neutralSite": false, "conferenceGame": true,
  "homeId": 61, "homeTeam": "Georgia", "homeConference": "SEC", "homePoints": 24,
  "awayId": 2439, "awayTeam": "Tennessee", "awayConference": "SEC", "awayPoints": 17,
  "playoff": null
}
```

- Kickoff: `startDate` (type `string`, format `date-time`) — no separate `status` enum exists
  on this endpoint; completion is signalled only by the boolean `completed`.
  **Gotcha**: there is no documented value meaning "postponed" or "canceled" — a
  postponed/canceled game presumably just stays `completed: false` indefinitely with nothing
  else to distinguish it from "hasn't been played yet."
- Home/away: `homeId`/`homeTeam`/`homeConference` and `awayId`/`awayTeam`/`awayConference`.
- Neutral site: `neutralSite` (bool). Conference game flag: `conferenceGame` (bool).
- `seasonType` enum: `regular | postseason | both | allstar | spring_regular |
  spring_postseason`.
- `playoff` is a nullable nested object (`GamePlayoff`) with `round`, `roundName`,
  `bracketSlot`, `bowlName`, `homeSeed`, `awaySeed` for CFP bracket games specifically.

### (b) `GET /scoreboard` — live scores

Distinct endpoint, described in the spec as "Returns current scoreboard data" — it takes only
`classification` (defaults to `fbs`) and `conference` filters, **no** `year`/`week`/`team`
params, meaning it always returns whatever games are scheduled/live/final *right now* across
the whole slate in one call. Response is an array of `ScoreboardGame`:

```json
{
  "id": 401520145, "startDate": "2023-08-26T16:00:00.000Z", "startTimeTBD": false,
  "status": "in_progress", "period": 3, "clock": "08:42",
  "situation": "1st & 10", "possession": "home", "lastPlay": "...",
  "homeTeam": { "id": 61, "name": "Georgia", "points": 24, "lineScores": [7,10,7,0], "winProbability": 0.82 },
  "awayTeam": { "id": 2439, "name": "Tennessee", "points": 17, "lineScores": [3,7,7,0], "winProbability": 0.18 },
  "betting": { "spread": -13.5, "overUnder": 52.5, "homeMoneyline": -650, "awayMoneyline": 480 }
}
```

- `status` is the `GameStatus` enum, **and it only has three values**:
  `"scheduled" | "in_progress" | "completed"` — no separate postponed/delayed/canceled value.
- Current period/quarter: `period` (nullable int). Clock: `clock` (nullable string, e.g.
  `"08:42"`). Also present: `situation` (down & distance), `possession`, `lastPlay`.
- Nested `venue{name,city,state}`, `weather{temperature,windSpeed,windDirection,description}`,
  `betting{spread,overUnder,homeMoneyline,awayMoneyline}` all ship on the same object — a
  single `/scoreboard` call already carries the spread/total for display alongside the score.

### (c) `GET /lines` — betting lines

Response is an array of `BettingGame`, each carrying a `lines: GameLine[]` array (one entry
per sportsbook):

```json
{
  "id": 401520145, "homeTeamId": 61, "homeTeam": "Georgia", "homeScore": 24,
  "awayTeamId": 2439, "awayTeam": "Tennessee", "awayScore": 17,
  "lines": [
    { "provider": "Bovada", "spread": -13.5, "formattedSpread": "Georgia -13.5",
      "overUnder": 52.5, "homeMoneyline": -650, "awayMoneyline": 480 }
  ]
}
```

- Query params include `provider` ("Betting line provider") typed as a plain `string` with
  **no enumerated list** anywhere in the spec. ([openapi.json](https://api.collegefootballdata.com/api-docs.json))
- The only provider name I could directly verify from a primary CFBD source is `"Bovada"`,
  from an official CFBD GraphQL blog example filtering
  `lines: { provider: { name: { _eq: "Bovada" } } }`
  ([GraphQL subscriptions blog post](https://radsportsanalytics.com/blog/subscribing-to-data-events-with-the-cfbd-graphql-api/)).
  Names like DraftKings/consensus/ESPN Bet are commonly referenced in third-party
  write-ups but I could **not** verify them directly against a primary CFBD source in this
  pass — treat the provider list as unknown/discoverable-at-runtime rather than hardcoding it.

### (d) `GET /rankings` — AP/CFP poll rankings

Response is an array of `PollWeek`:

```json
{
  "season": 2023, "week": 5,
  "polls": [ { "poll": "AP Top 25", "isFinal": false,
    "ranks": [ { "rank": 1, "teamId": 251, "school": "Georgia", "firstPlaceVotes": 62, "points": 1550 } ] } ]
}
```

- `poll` (string, e.g. AP/Coaches/CFP poll name — not enumerated in the spec, discover values
  by calling without a `poll` filter). `isFinal` (nullable bool) matters for CFP snapshots.
- `/rankings` has `latest`/`final` boolean params scoped specifically to `poll=cfp`, for
  pulling the latest or the finalized CFP snapshot.
- Per-team rank fields: `rank` (nullable int, absent = unranked/receiving-votes edge case),
  `teamId`, `school`, `firstPlaceVotes`, `points`.

### (e) `GET /teams` / `GET /teams/fbs` — team metadata

Response is an array of `Team`:

```json
{
  "id": 61, "school": "Georgia", "mascot": "Bulldogs", "abbreviation": "UGA",
  "alternateNames": ["UGA"], "conference": "SEC", "color": "#ba0c2f",
  "logos": ["https://a.espncdn.com/i/teamlogos/ncaa/500/61.png"],
  "location": { "id": 3607, "name": "Sanford Stadium", "city": "Athens", "state": "GA" }
}
```

- Team id: `id` (int32). Abbreviation: `abbreviation` (nullable). Colors: `color` /
  `alternateColor`. Logo URLs: `logos` (nullable array of strings).
- **Gotcha vs. the legacy client**: the legacy `cfb.js` (v1) `Team` model instead had
  `altName1`/`altName2`/`altName3` fields — the current v2 spec replaced those with a single
  `alternateNames` array. Code written against `cfb.js`'s docs will not match the live API.

## 3. Identity

- **Stable game id**: `id` (int32), same field name on `Game`, `ScoreboardGame`, and
  `BettingGame`. `/lines` accepts a `gameId` filter described simply as "Game ID," matching
  `/games`'s own `id` param — strongly implying shared identity, though the spec never states
  in so many words "this equals Game.id"; that's a reasonable inference from shared
  naming/typing, not an explicit guarantee. ([openapi.json](https://api.collegefootballdata.com/api-docs.json))
- **Stable team id**: `id` (int32) on `Team`, mirrored as `homeId`/`awayId` on `Game`,
  `homeTeamId`/`awayTeamId` on `BettingGame`, nested `homeTeam.id`/`awayTeam.id` on
  `ScoreboardGame`, and `teamId` on `PollRank` — consistent int32 across every endpoint
  checked.
- **Naming inconsistency**: `Game`/`BettingGame`/`ScoreboardGame` all represent each team as a
  plain school-name string (`"homeTeam": "Georgia"`), while `Team` separately exposes
  `school`, nullable `mascot`, nullable `abbreviation`, and a nullable `alternateNames` array.
  Since `mascot`/`abbreviation`/`alternateNames` are all nullable, and CFBD ships an explicit
  alternate-names list at all, treat team **names** as display-only and resolve via id.
- **GitHub issues**: checked `CFBD/cfb-api-v2` (the actual API server repo) — at research
  time it had 6 issues total, **all closed, 0 open**, none about team-name mismatches
  ([issue list](https://github.com/CFBD/cfb-api-v2/issues)). No primary CFBD source
  documenting known team-name mismatches was found beyond the schema-level nullability above.

## 4. Timing

- Kickoff time: `startDate` on both `Game` and `ScoreboardGame`, typed `string` with OpenAPI
  format `date-time` (ISO 8601). The spec's own schema does **not** add prose clarifying UTC
  vs. local — I could not verify the timezone convention from a primary-source statement, only
  infer it from OpenAPI's standard `date-time` format. Recommend parsing as ISO 8601 and
  rendering in the viewer's local timezone rather than assuming a fixed offset.
- TBD flag: `startTimeTBD` (boolean) on both `Game` and `ScoreboardGame`.
- Week numbering: `week` is a plain `int32` on `Game`/`BettingGame`/`PollWeek` with **no
  documented reserved values** in the spec (no "week 0" or "conference championship week"
  callout in any parameter/schema description found). `seasonType` enum values are
  `regular | postseason | both | allstar | spring_regular | spring_postseason`. I could
  **not** verify from a primary CFBD source whether conference championship games are filed
  under the final `regular` week or under `postseason` — treat this as unverified.
  Recommendation: treat `(season, seasonType, week)` as an opaque scoping key, always pass
  `seasonType` explicitly, and confirm empirically (pull a past championship-week slate with
  your own key) before hardcoding an assumption about which week/seasonType it carries.
- Postseason/playoff detail: the nullable `playoff` object on `Game` (`GamePlayoff`) carries
  `round`, `roundName`, `bracketSlot`, `bowlName`, `homeSeed`, `awaySeed` for CFP games, which
  is a more reliable way to identify bracket games than `week` alone once it's populated.

## 5. Practical polling strategy

- **Single-call live scores**: `/scoreboard` needs exactly one call per poll, regardless of
  slate size — it has no per-game or per-team filter, only `classification`/`conference`, so
  it returns the whole current slate (and beyond) at once.
  ([openapi.json description: "Returns current scoreboard data"](https://api.collegefootballdata.com/api-docs.json))
- **Quota**: Tier 1 = 5,000 calls/month
  ([api-tiers](https://collegefootballdata.com/api-tiers)). A Saturday's live window runs
  roughly noon–midnight ET, ~10 active hours. Polling every **2 minutes** = 30/hr × 10hr =
  **~300 calls** for the whole Saturday; even every **60 seconds** = **~600 calls**. Either
  is well under 1/8 of the 5,000/month budget for one Saturday, leaving thousands of calls
  spread across slate-building (`/games`, `/teams`, `/rankings`), `/lines` look-ups, and the
  ~14 other Saturdays in a season.
- **Recommendation**: poll `/scoreboard` every 2–3 minutes from first kickoff through the last
  game's final whistle; back off once every slate game shows `status: "completed"`. No
  per-minute rate limit applies
  ([v2 GA blog](https://radsportsanalytics.com/blog/api-v2-is-now-in-general-availability/)) —
  only the monthly cap constrains this.
- **Gotcha — other endpoints lag**: CFBD's own maintainer (GitHub user `BlueSCar`) answered a
  question about update frequency for per-game/per-team stat sub-endpoints by saying they
  "are updated at the conclusion of each game," i.e. **not** live
  ([CFBD/cfb-api-v2 issue #6](https://github.com/CFBD/cfb-api-v2/issues/6)). Only
  `/scoreboard`'s own embedded fields (`status`, `period`, `clock`, `points`, `lineScores`,
  `winProbability`) update during a live game; don't poll box-score/player-stat endpoints
  expecting live detail.

## 6. Official TS/JS client

- **Current/official**: [`cfbd` on npm](https://www.npmjs.com/package/cfbd), source at
  [github.com/CFBD/cfbd-typescript](https://github.com/CFBD/cfbd-typescript). Registry
  metadata (`https://registry.npmjs.org/cfbd`) shows latest version **5.26.0**, published
  **2026-09-03** — the same version number as the live OpenAPI spec fetched for this research
  (`api.collegefootballdata.com/api-docs.json` → `"version": "5.26.0"`), i.e. it is generated
  from and kept in lockstep with the current v2 spec, not the legacy one. It's generated
  automatically via the [Hey API](https://heyapi.dev) OpenAPI-to-TypeScript toolchain
  (`@hey-api/openapi-ts` devDependency, `@hey-api/client-fetch` runtime dependency). Auth is
  set via `client.setConfig()` with an `Authorization: Bearer <key>` header. The
  collegefootballdata.com nav itself labels it **"TypeScript Library (Official)"** alongside
  an official Python library and an official C# library, distinct from the third-party
  `cfbfastR` (R). ([api-tiers page nav](https://collegefootballdata.com/api-tiers))
- **Legacy, do not use for new work**: [`cfb.js`](https://github.com/CFBD/cfb.js), a
  Swagger-Codegen-generated client at package/API version **4.6.0**, targeting the retired v1
  API (shut down prior to the 2025 season per the
  [v2 GA blog post](https://radsportsanalytics.com/blog/api-v2-is-now-in-general-availability/)).
  Its field names diverge from the live v2 spec in at least the `Team` model (`altName1/2/3`
  vs. v2's single `alternateNames`) and the `Game` model (v1's docs show no `status` enum at
  all, only `completed` — matching v2's `/games` but not v2's richer `/scoreboard`). I could
  not verify an explicit "unmaintained" statement about `cfb.js` from a primary source; this
  staleness assessment is inferred from the field mismatches plus the v1-shutdown statement,
  not a direct maintainer statement about this package specifically.
