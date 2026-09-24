# CFBD calls for a final game's team stats and leaders

Research for #267 (map #264, Game sheet). The design it serves is the resolution
comment on #265: the Final sheet shows seven **team stats** rows and five **game
leaders**, each with a name, a position and a detail line.

Researched 2026-09-23/24. Each claim carries one label:

- **[SPEC]**: the live OpenAPI spec, `https://api.collegefootballdata.com/api-docs.json`
  (version **5.30.0** at fetch time).
- **[OBSERVED]**: a real call made for this ticket with the project's Tier 3 key.
  There were 18 calls in all, 15 of them metered (see §5).
- **[SOURCE]**: a first-party statement from CFBD's maintainer or CFBD's own pages.

The calls used 2025 week 2 as the historical sample. They also used 2026 week 3,
the most recent completed week, played 2026-09-19. 2026 week 4 had not started.

## Summary

- **One call per week covers every game in the slate, for each of the two
  endpoints.** `GET /games/teams?year&week&classification=fbs` and
  `GET /games/players?year&week&classification=fbs` each returned exactly one
  entry, with both teams, for every game `/games` listed. That held in 2025 week 2
  (83/83 games, including 33 FBS-vs-FCS games) and in 2026 week 3 (75/75). [OBSERVED]
- **A single game is also one call** (`?id=<gameId>`, ~2.8 KB for team stats). Use
  it to fetch one game the moment it goes final. The week-wide player call is
  **~2.2–2.6 MB**, because it returns every player's line in every category. [SPEC] [OBSERVED]
- **All seven team-stat rows come straight from `/games/teams`**, every one as a
  preformatted string. None was missing on any of 316 team sides. [OBSERVED]
- **All five leaders and their detail lines come from `/games/players`.** Two
  traps: a **pseudo-player "Team" with a negative id** has to be filtered out, and
  **ties and zero-sack games are common**. [OBSERVED]
- **Positions come from `/roster`, and one call covers every team for a season.**
  `team` is optional. `/roster?year=2026` returned 31,283 players on 310 teams
  (~9.3 MB). Every one of the 750 leaders in 2026 week 3 was found in it by player
  `id`, with a position. [SPEC] [OBSERVED]
- **Freshness:** the maintainer says per-game box-score stats are "updated at the
  conclusion of each game". Nothing first-party gives minutes. **Measure it on a
  live Saturday before designing the fetch cadence** (§4). [SOURCE]
- **Colours:** `/teams/fbs?year=2026` returned 138 teams, and every one has
  `color` and `alternateColor` as lowercase `#rrggbb`. No team has the two equal.
  All 682 teams in `/teams` have a `color`, so FCS opponents are covered too. [OBSERVED]
- **Quota:** `/games/teams`, `/games/players`, `/roster`, `/teams`,
  `/teams/fbs` and `/games` each cost **1 call**, whatever their size or scope.
  `/scoreboard` cost **0**. [OBSERVED]

---

## 1. `/games/teams` and `/games/players`

### Parameters [SPEC]

Both endpoints take the same parameters: `year`, `week`, `team`, `conference`,
`classification`, `seasonType`, `id`. `/games/players` also takes `category`.
According to the spec, `year` is "Required unless `id` is specified", and "One of
`week`, `team`, or `conference` is required when filtering by year". `id`: "When
specified, returns statistics for that game."

### Response shape [SPEC] [OBSERVED]

```
/games/teams   -> GameTeamStats[]   { id, teams: [{ teamId, team, conference, homeAway, points,
                                                    stats: [{ category, stat }] }] }
/games/players -> GamePlayerStats[] { id, teams: [{ team, conference, homeAway, points,
                                                    categories: [{ name, types: [{ name,
                                                      athletes: [{ id, name, stat }] }] }] }] }
```

- The `id` at the top level is the CFBD game id, the same id `/games` and
  `/scoreboard` use. [OBSERVED]
- **`stat` is always a string**, including counts (`"24"`), splits (`"7-12"`),
  times (`"28:41"`) and decimals (`"12.8"`). [SPEC] [OBSERVED]
- **The team object in `/games/players` has no `teamId`**. It has only the `team`
  name and `homeAway`. The spec lists no `teamId` there, and the observed keys are
  `team, conference, homeAway, points, categories`. Join the two teams by
  `homeAway` against the game's `homeId`/`awayId`, not by name. [SPEC] [OBSERVED]
- Athlete `id` is a **string** (`"4596472"`). [SPEC] [OBSERVED]

### Coverage [OBSERVED]

| Sample | `/games` games (all completed) | `/games/teams` entries | `/games/players` entries | Sides per game |
|---|---|---|---|---|
| 2025 wk 2, `classification=fbs` | 83 (33 with an FCS side) | 83, ids identical | 83, ids identical | always 2 |
| 2026 wk 3, `classification=fbs` | 75 | 75, ids identical | 75, ids identical | always 2 |
| 2026 wk 4 (not yet played) | 71, none completed | `[]` | `[]` | n/a |

- `classification=fbs` means **at least one side is FBS**: FBS-vs-FCS games are
  included, with full stats for the FCS side as well. [OBSERVED]
- For a week that has not been played yet, the endpoint returns **`[]` with HTTP
  200** and still charges 1 call. Treat an empty response as "not yet", not as an
  error. [OBSERVED]
- Neither sample returned any stats for a non-completed game. Neither sample could
  show whether an **in-progress** game shows up, since both weeks were fully
  final or fully unplayed. [OBSERVED]

### Team-stats rows → `category` [OBSERVED]

| Sheet row | `category` | Example `stat` | Present on |
|---|---|---|---|
| Total yards | `totalYards` | `"631"` | 166/166 (2025 wk 2), 150/150 (2026 wk 3) |
| Turnovers | `turnovers` | `"0"` | all |
| 1st downs | `firstDowns` | `"24"` | all |
| Penalties (count-yards) | `totalPenaltiesYards` | `"6-35"` | all |
| 3rd down (made/att) | `thirdDownEff` | `"7-12"` | all |
| 4th down (made/att) | `fourthDownEff` | `"1-2"` | all |
| Possession | `possessionTime` | `"28:41"` (mm:ss) | all |

- `turnovers` equals `fumblesLost + interceptions` (interceptions **thrown**) on
  all 166 sides checked. [OBSERVED]
- Category **presence varies for optional stats**: `fumblesRecovered`,
  `interceptionYards`, `kickReturns` and the like are missing when zero or unused
  (for example, `interceptionTDs` is on 87 of 166 sides). The seven rows above were
  never missing. Still, parse by `category` name, never by array position. [OBSERVED]
- For the bars, split `"7-12"` / `"6-35"` on `-`. `possessionTime` is `mm:ss` and
  the two sides add up to 60:00 in regulation (34:14 + 25:46 in the example
  below). [OBSERVED]

Other categories returned, in case they are useful later: `completionAttempts`
(`"18-25"`), `netPassingYards`, `rushingYards`, `rushingAttempts`, `yardsPerPass`,
`yardsPerRushAttempt`, `passingTDs`, `rushingTDs`, `sacks`, `tackles`,
`tacklesForLoss`, `qbHurries`, `passesDeflected`, `defensiveTDs`,
`fumblesLost`, `fumblesRecovered`, `totalFumbles`, `interceptions`,
`passesIntercepted`, `interceptionYards`, `interceptionTDs`, kick and punt return
counts, yards and TDs, and `kickingPoints`. [OBSERVED]

### Leaders → `categories[].name` / `types[].name` [OBSERVED]

| Leader | Rank by | Detail line built from |
|---|---|---|
| Passing yards | `passing` / `YDS` | `passing` `C/ATT` (`"18/30"`, already slash-formatted), `TD`, `INT` → "18/30, 2 TD" |
| Rushing yards | `rushing` / `YDS` | `rushing` `CAR`, `TD` → "10 car, 1 TD" |
| Receiving yards | `receiving` / `YDS` | `receiving` `REC`, `TD` → "6 rec, 2 TD" |
| Sacks | `defensive` / `SACKS` (decimal, `"0.5"`) | `defensive` `TFL`, `TOT` |
| Tackles | `defensive` / `TOT` | `defensive` `SOLO` → "5 solo" |

To build a detail line, take the leader's `id` from the ranking type and look it
up in the sibling types of the same category. Every athlete appears in every type
of their category. The other types returned are `passing` `AVG`/`QBR`, `rushing`
`AVG`/`LONG`, `receiving` `AVG`/`LONG`, `defensive` `QB HUR`/`PD`/`TD`, and the
`fumbles`, `interceptions`, `kicking`, `punting`, `kickReturns` and `puntReturns`
categories. [OBSERVED]

**Traps [OBSERVED]:**

- **The "Team" pseudo-player.** Rows with a negative `id` (`"-6704"`) and the name
  `" Team"` (with a leading space) show up in `passing`, `defensive`, `punting`
  and other categories. In the 2025 week 2 sample one never outranked a real
  player, but it has to be filtered out (`id.startsWith('-')`). A position lookup
  on it would fail anyway.
- **Ties are common.** Among 166 team sides, the top value was tied in
  `defensive/SACKS` on 100 sides, in `defensive/TOT` on 33, in `receiving/YDS` on
  2 and in `rushing/YDS` on 1. The API gives no tiebreak, so the app needs its own
  rule (a secondary stat, e.g. TFL for sacks and SOLO for tackles, then name).
- **Zero-sack sides.** On 40 of 166 sides nobody had a sack, so the "leader" would
  be a player with `0`. Alabama 73–0 UL Monroe (2025 wk 2) is one case on both
  sides. The sheet needs an empty state for the sacks row.
- **Sacks are decimals** (`"0.5"`, shared sacks). Rank with `parseFloat`.

### Worked example: 2025 wk 2, UL Monroe @ Alabama (game 401752681) [OBSERVED]

| Row | UL Monroe | Alabama |
|---|---|---|
| Total yards | 148 | 583 |
| Turnovers | 3 | 0 |
| 1st downs | 9 | 29 |
| Penalties | 4-41 | 5-55 |
| 3rd down | 6-14 | 9-12 |
| 4th down | 0-1 | 2-2 |
| Possession | 25:46 | 34:14 |
| Passing | Aidan Armenta, QB, 28: "8/14, 0 TD, 1 INT" | Ty Simpson, QB, 226: "17/17, 3 TD" |
| Rushing | Braylon McReynolds, RB, 24: "7 car" | AK Dear, RB, 76: "5 car, 1 TD" |
| Receiving | Tyler Griffin, WR, 22: "2 rec" | Germie Bernard, WR, 67: "3 rec, 2 TD" |
| Sacks | nobody (0) | nobody (0) |
| Tackles | Kam Canterbury, S, 7: "5 solo" | James Smith, DT, 4: "4 solo" |

## 2. Positions: `/roster`

- `GET /roster` takes `team` (optional), `year` ("Defaults to 2025") and
  `classification` (`fbs`/`fcs`). It returns `RosterPlayer { id, firstName,
  lastName, team, height, weight, jersey, year, position (nullable), home… ,
  recruitIds }`. [SPEC]
- **`team` is optional, so a whole season is one call**:
  - `/roster?year=2025`: 30,070 players, 315 teams, ~8.9 MB.
  - `/roster?year=2025&classification=fbs`: 15,599 players, 136 teams, ~4.7 MB.
  - `/roster?year=2026`: 31,283 players, 310 teams, ~9.3 MB.

  Each costs 1 call. [OBSERVED]
- A per-team call (`?team=Alabama&year=2026`) is also 1 call, so for a slate the
  choice is between about 2×N small calls and one large one. [SPEC] (cost per call
  [OBSERVED] for the other endpoints; per-team size not measured)
- **The join works:** `/games/players` athlete `id` equals `RosterPlayer.id`.
  Leaders in 2026 wk 3 were found in `/roster?year=2026` 750/750, FCS sides
  included, and none had a null or `?` position. In 2025 wk 2, leaders were found
  in `/roster?year=2025` 830/830, and 1 had a null position. Across all
  leader-category athletes in 2025 wk 2 the match was 10,216/10,216. [OBSERVED]
- **Use the same season's roster.** 2026 wk 3 athletes matched the *2025* roster
  only 7,746/8,915 times (freshmen and transfers). [OBSERVED]
- **Positions are not normalised.** Values include `QB RB WR TE OL OT G C DL DE DT
  NT EDGE LB DB CB S PK P LS FB ATH KR`, plus `null` (5% of 2026 players) and a
  literal `"?"`. The sheet needs a fallback (omit the position) for `null`/`"?"`.
  [OBSERVED]
- The roster can change mid-season (walk-ons, transfers). Nothing documents how
  often CFBD refreshes it. If a leader's id is missing from a cached roster, one
  re-fetch is cheap. [SOURCE: none found; inference]

## 3. `/teams` colours

- `Team.color` and `Team.alternateColor` are nullable strings. [SPEC]
- `/teams/fbs?year=2026`: **138 teams, 138 with `color`, 138 with
  `alternateColor`**, none with the two identical. The format is lowercase
  `#rrggbb` (Air Force `#003594`/`#ffffff`, Akron `#041e42`/`#a89968`, Alabama
  `#9e1b32`/`#ffffff`). This confirms the ticket's premise. [OBSERVED]
- `/teams?year=2026`: 682 teams (138 fbs, 128 fcs, 170 ii, 246 iii), **all with a
  `color`**. All 33 FCS opponents in 2025 wk 2 had one. [OBSERVED]
- Many `alternateColor`s are `#ffffff`, which will fail the 3:1 test on the card.
  That is expected and is what #265's pairing rule handles. [OBSERVED]

## 4. When the stats populate after the final whistle

- **Maintainer statement.** Asked (CFBD/cfb-api-v2#6, 2025-06-26) whether the
  per-game stats endpoints are real-time, BlueSCar (CFBD's maintainer) replied on
  2025-07-03: *"These are updated at the conclusion of each game. Please refer to
  the website for more information on data availability and update frequency:
  https://collegefootballdata.com/about"*.
  (https://github.com/CFBD/cfb-api-v2/issues/6) [SOURCE]
- **The page it points to could not be read.** collegefootballdata.com/about is
  rendered client-side, and neither a plain fetch nor a text extraction yielded
  any timing text. `api.collegefootballdata.com/usage-and-access` does not cover
  freshness. [SOURCE: attempted, nothing found]
- **The spec says nothing about latency** for these endpoints. [SPEC]
- **Observed bound:** by Wed 2026-09-23 (four days after), every completed 2026
  wk 3 game had both team and player stats. That rules out "weekly batch after
  the week" only loosely, and proves nothing about minutes versus hours.
  [OBSERVED]
- **Not answered: minutes versus hours.** The cheapest way to measure it is on a
  live Saturday. When `/scoreboard` (free) first shows a game as `completed`,
  call `/games/teams?id=<id>` and `/games/players?id=<id>` every ~5 minutes until
  both are non-empty, and log the delay. At 2 calls per poll, a handful of games
  costs well under 100 calls. Until that is measured, the Final sheet has to
  handle "final, but stats not in yet" (an empty `[]` or a missing id), with a
  placeholder rather than an error.

## 5. Quota cost per call

`X-CallLimit-Remaining` is returned on every response and reflects the count
**after** the call. Sequence observed on 2026-09-23/24: [OBSERVED]

| # | Call | Remaining | Cost |
|---|---|---|---|
| 1 | `/scoreboard` | 74,860 | — |
| 2 | `/games/teams?year=2025&week=2&classification=fbs` | 74,859 | 1 |
| 3 | `/scoreboard` | 74,859 | **0** |
| 4 | `/games/players?year=2025&week=2&classification=fbs` (2.6 MB) | 74,858 | 1 |
| 5 | `/games?year=2025&week=2&classification=fbs` | 74,857 | 1 |
| 6 | `/roster?year=2025` (8.9 MB, all teams) | 74,856 | 1 |
| 7 | `/roster?year=2025&classification=fbs` | 74,855 | 1 |
| 8 | `/teams/fbs?year=2026` | 74,854 | 1 |
| 9 | `/teams?year=2026` | 74,853 | 1 |
| 10–12 | `/games`, `/games/teams`, `/games/players` for 2026 wk 4 (empty `[]`) | 74,850 | 1 each |
| 13 | `/games/teams?id=401752681` | 74,849 | 1 |
| 14 | `/scoreboard` | 74,849 | **0** |
| 15–17 | `/games`, `/games/teams`, `/games/players` for 2026 wk 3 | 74,846 | 1 each |
| 18 | `/roster?year=2026` | 74,845 | 1 |

- **Every endpoint in scope is metered at a flat 1 call per request**, whatever
  the response size or scope, and an empty `[]` still costs 1. `/scoreboard` cost 0
  both times it was checked. [OBSERVED]
- The spec does not document the header or per-endpoint metering. It never
  mentions a call limit or quota. [SPEC]
- Responses have a weak `ETag`, and `cf-cache-status: DYNAMIC`, meaning
  Cloudflare does not cache them. Nothing showed whether a conditional request
  (`If-None-Match`) avoids the charge. Not tested. [OBSERVED]

### Budget sketch (Tier 3, 75,000/month)

- Per season: one `/roster?year=…` (1 call), or one per slate team. One
  `/teams/fbs` or `/teams` for colours (1 call).
- Per final game: `/games/teams?id` + `/games/players?id` = **2 calls**, plus
  retries until populated. A ~15-game slate with a few retries each comes to
  ≈ 50–100 calls a week.
- Alternatively, per week: the two week-wide calls cost 2 calls per poll. Polling
  them every 10 minutes over a 12-hour Saturday is ~144 calls, but each poll
  downloads ~2.5 MB of player stats.
- Both are negligible against 75,000/month. The trade-off is bandwidth and
  latency, not quota.

## Open questions

1. How many minutes after `completed` on `/scoreboard` do `?id=` stats appear
   (§4)? Measure on a live Saturday.
2. Do in-progress games appear in `/games/teams` / `/games/players` with partial
   stats, and could a partial box score be mistaken for a final? Only a live
   window can show this.
3. Do stats get corrected after first publication (stat corrections)? If so, a
   one-time fetch at final needs a later re-fetch.
4. Does `If-None-Match` avoid the charge? Not tested.
