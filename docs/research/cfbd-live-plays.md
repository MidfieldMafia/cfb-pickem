# What CFBD's live play-by-play returns during a real game

Research for #266 (map #264, Game sheet). It also answers #172's open question
on the raw value of `/scoreboard`'s `possession`.

Researched on Thu 2026-09-24 against one live FBS game: **Liberty @ Coastal
Carolina, game `401869941`**, kickoff 23:30Z, final 03:4xZ (Liberty 34–17).
Every claim carries one of these labels:

- **[SPEC]**: the live OpenAPI spec, `https://api.collegefootballdata.com/api-docs.json`
  (version **5.30.0** at fetch time).
- **[OBSERVED]**: a real call made for this ticket with the project's Tier 3 key.
  `GET /live/plays?gameId=401869941` and `GET /scoreboard?classification=fbs` were
  polled as a pair from 00:20Z to 03:43Z (29 rounds, plus one 40-second triple).
  One conditional fetch followed 15 minutes after the final (`post15`, 03:58:50Z).
  Citations name the round by its UTC fetch time (`r05 00:42:15Z`). Per-round
  state is in [`cfbd-live-plays/rounds.tsv`](cfbd-live-plays/rounds.tsv).
- **[CROSS-CHECK]**: ESPN's public summary endpoint
  (`site.api.espn.com/.../college-football/summary?event=401869941`), fetched
  once at 00:28Z and once after the final. It is not a CFBD source; §7 uses it
  only to show where CFBD's data comes from.
- **[USER]**: Jonah was watching the broadcast.

Evidence committed next to this doc, in `docs/research/cfbd-live-plays/`:

| File | What it is |
|---|---|
| `live-plays-401869941-final-20260925T034334Z.json` | The whole final `/live/plays` response, minified (91 KB) |
| `live-plays-midgame-excerpt-20260925T005255Z.json` | A mid-game response with the game header and `teams[]`, trimmed to the last drive's last 4 plays |
| `scoreboard-401869941-excerpts.json` | This game's `/scoreboard` entry at 5 fetch times |
| `revisions.json` | Every play that changed under the same `id` between fetches (8) |
| `rounds.tsv` | One row per fetch: HTTP status, `x-calllimit-remaining`, size, ETag, live header, last play, scoreboard state |
| `headers-200-and-304.txt` | Full response headers of a 200 and a conditional 304 |

## Summary

- **One call returns the whole game so far**: every drive, every play, plus
  per-team advanced stats. Nothing is incremental. The response grew from 20 KB
  in Q1 to **91 KB** at the final (11 KB gzipped; the server does compress). [OBSERVED]
- **Each call is metered, 304s included.** `If-None-Match` does return **304**
  with no body when nothing changed, but it still cost a call. `/scoreboard` cost
  nothing across 31 calls. [OBSERVED]
- **A play gives you its start spot, not its end spot.** `yardsToGoal` is the
  line of scrimmage, measured from the play's `teamId`. For 148 of 180 consecutive
  pairs, the play's end spot equals the **next play's** `yardsToGoal` and `teamId`.
  The 32 exceptions are predictable: touchdowns, timeouts, period ends and
  possession changes (§3). For the newest play, the game header's `down` /
  `distance` / `yardsToGoal` hold the end state. [OBSERVED]
- **`yardsGained` cannot be trusted as signed movement.** Penalties carry the
  penalty yards unsigned (+5 on a false start that moved the offense back 5).
  Kicks carry the **return** yards, not the kick distance. It was also plainly
  wrong once: 0 on a 2-yard run. [OBSERVED]
- **Plays are revised in place, which matters most for an animated field.** Over
  3.5 hours, 8 plays changed under the same `id`. One `Sack` (−4) became a
  `Penalty` (+10, NO PLAY). One `Fumble` became `Fumble Recovery (Opponent)`, a
  turnover that first appeared as a plain 6-yard run. A sack's text went from
  `"D. Bailey sacked"` to the full description, and its yards from 0 to −20.
  Three of these also moved `wallClock`. No play was ever removed, and none was
  inserted behind an already-seen play. [OBSERVED]
- **`playType` is not reliable for turnovers.** A fumble that Coastal *recovered*
  is labelled `Fumble Recovery (Own)`. Detect a change of possession when the
  next play's `teamId` differs from this one's, not from the `playType` name. [OBSERVED]
- **Latency:** the newest play was never less than **32 s** old at fetch time. At
  least 12 plays were missing from a fetch made 1–99 s after their own `wallClock`.
  `wallClock` itself is when the play was entered, not when it was snapped: it
  moves when the play is revised. Budget **~1–2 minutes** from the snap. [OBSERVED]
- **`/scoreboard` trails `/live/plays`.** Of the 30 in-play rounds, the live
  header was ahead of the scoreboard's clock in 15 and level in 15. The
  scoreboard was never ahead. Once, the scoreboard entry did not change for
  7 minutes (03:01Z–03:08Z) while three new plays appeared in the live feed. [OBSERVED]
- **#172 answer:** `/scoreboard`'s `possession` is the literal string **`"home"`**
  or **`"away"`**, or `null`. It was `null` whenever `situation` was null
  (kickoffs, timeouts, after scores, halftime, before and after the game), with
  one exception: at end of game it read `"away"` with `situation: null` (r28).
  `/live/plays`' own `possession` is different. It is a **team name**, and it
  names the team on the last play, so after a punt or kickoff it points at the
  wrong team for the next snap. [OBSERVED]
- **The feed is ESPN's play-by-play, re-served.** The final response and ESPN's
  public summary have the same 181 play ids, identical `playText`, identical
  `wallClock`, `yardsGained` = ESPN `statYardage` and `yardsToGoal` = ESPN
  `start.yardsToEndzone`, in every one of the 181 plays. CFBD drops ESPN's `end`
  spot. [CROSS-CHECK]

---

## 1. Response shape

### Game header [SPEC] [OBSERVED]

`LiveGame { id, status, period, clock, possession, down, distance, yardsToGoal, teams[], drives[] }`.
The spec marks `possession` a plain string and `down`/`distance`/`yardsToGoal`/`period`
nullable. Its description adds: "Results may be cached for up to five seconds after
calculation." [SPEC]

Observed values:

| Field | Values seen | Notes |
|---|---|---|
| `status` | `"In Progress"`, `"End of Period"` (r05 00:42:15Z, after Q1), `"Halftime"` (r12–r14 01:42–01:56Z), `"Final"` (r29 03:43:34Z) | Title-case prose, **not** the scoreboard's `in_progress`/`completed` enum. At the end of Q2 and Q4 it still read `"In Progress"` with `clock "0:00"` until the next fetch (r11 01:35:14Z, r28 03:36:33Z). |
| `period` | 1–4, `null` at Final | |
| `clock` | `"3:05"`, `"0:00"`, `""` at Final | `m:ss`, no leading zero. The scoreboard uses `"03:05"`. |
| `possession` | `"Liberty"`, `"Coastal Carolina"`, `""` at Final | **Team name, and it is the last play's `team`** (30/30 in-play fetches). After a kickoff or punt it names the kicking team (r01 00:20:52Z: `"Liberty"` right after Liberty's kickoff, with Coastal to snap next). |
| `down` | 1–4, **`0`** (after a timeout: r06 00:49:15Z, r08, r10, r17, r19), **`-1`** with `distance 0`, `yardsToGoal 0` after a touchdown (r27 03:29:33Z), `null` at Final | Handle 0/−1 as "no down". |
| `distance`, `yardsToGoal` | ints | These are the **end state of the last play**, i.e. the next snap's spot, but measured from the team in `possession`. When the last play changed possession, that is the wrong team (r01: `Liberty 1st & 10, ytg 49`, when it was Coastal's ball at the LIB49). |

At the final, every live field was blanked: `period null, clock "", possession "",
down/distance/yardsToGoal null` (r29). [OBSERVED]

### `drives[]` [SPEC] [OBSERVED]

`{ id, offenseId, offense, defenseId, defense, playCount, yards, startPeriod,
startClock, startYardsToGoal, endPeriod, endClock, endYardsToGoal, duration,
scoringOpportunity, result, pointsGained, plays[] }`.

- `id` is the game id followed by a sequence number (`"40186994110"`). [OBSERVED]
- A drive's `plays[]` **starts with the kickoff or punt that began it**, and that
  play's `teamId` is the *kicking* team. So `plays.length` is `playCount + 1` on
  such drives (drive 1: `playCount 5`, 6 plays). [OBSERVED]
- `result` values seen: `Interception`, `Field Goal`, `Touchdown`, `Punt`,
  `Fumble`, `Downs`, `End Of Half`, `End Of Quarter`, and `""` for the drive in
  progress. [OBSERVED]
- **Drive metadata is loose.** Every touchdown drive has `endYardsToGoal: 3`, not 0.
  One finished Q4 Coastal drive (id `40186994128`, a punt) still had `result ""`,
  `startYardsToGoal 100`, `startClock null`, `endYardsToGoal null` in the final
  response. Do not draw the field from drive fields. [OBSERVED]

### `plays[]` [SPEC] [OBSERVED]

`{ id, homeScore, awayScore, period, clock, wallClock, teamId, team, down,
distance, yardsToGoal, yardsGained, playTypeId, playType, epa, garbageTime,
success, rushPass, downType, playText }`. [SPEC]

- `id` is a string, the game id followed by a sequence number. Within the array,
  plays are in `wallClock` order (never out of order in any capture), but **not
  in id order**: a timeout is often numbered 2 above the snap it precedes
  (`...56` before `...54`, 11 times in the final). Sort by array position or
  `wallClock`, not by id. [OBSERVED]
- `homeScore`/`awayScore` are the score **after** the play, extra point
  included: the touchdown play itself carries +7 (all 6 TDs). The PAT is not a
  separate play. It is appended to the TD's `playText`. [OBSERVED]
- `clock` is the game clock **after** the play. `playText` starts with the clock
  at the snap (`"(03:13) #98 T.Black kickoff..."` has `clock "3:05"`). Some plays
  have no `(mm:ss)` prefix (penalties, timeouts). [OBSERVED]
- `teamId` / `team` is the offense for a snap, and the kicking team for a
  kickoff or punt. [OBSERVED]
- `epa` is `null` on kickoffs, penalties, timeouts and period markers. [OBSERVED]

### `teams[]` [SPEC] [OBSERVED]

Two entries, `{ teamId, team, homeAway, lineScores[], points, drives,
scoringOpportunities, pointsPerOpportunity, averageStartYardLine, plays,
lineYards…, epaPerPlay, totalEpa, passingEpa, …, explosiveness, deserveToWin }`.
`lineScores` fills in by quarter (`[3, 14, 0, 0]`). These are CFBD's advanced
metrics, not box-score stats (no total yards, turnovers or first downs).
[SPEC] [OBSERVED]

## 2. `playType` values and what they give an animated field

All 181 plays in the final response. "Start" is `yardsToGoal` for `teamId`
(yards from the goal that team is attacking). "End = next start" means the next
play's `yardsToGoal` and `teamId` hold the end spot. [OBSERVED]

| `playType` (`id`) | Count | `rushPass` | `yardsGained` means | End spot | Carries |
|---|---|---|---|---|---|
| Rush (5) | 67 | rush | Signed gain, **except once** (0 on "rush middle for 2 yards gain", id `…377`) | Next start, unless the next row is a Timeout or End Period (see §3) | Gain. A penalty on the play is folded into the text and the next start (`…135`, `…482`) |
| Pass Reception (24) | 23 | pass | Signed gain, before any penalty | Next start | Gain. Roughing the passer on `…253` moved the ball 12 more yards, which only the next start (and the revised text) shows |
| Pass Incompletion (3) | 21 | pass | 0 | Next start | Nothing to animate but the throw |
| Penalty (8) | 19 | other | **Unsigned penalty yards** (+5 on a false start that moved the offense back 5, `…69`), even when declined (`…197`: 10, spot unchanged) | Next start | Penalty. Direction and whether it is `NO PLAY` are only in `playText` |
| Kickoff (53) | 11 | other | **Return yards** (0 on touchback or fair catch, 51 on a 51-yard return) | Next start, for the **other** team | Change of possession. `yardsToGoal` is 65 from the kicker's side, and the kick distance is only in `playText` |
| Timeout (21) | 11 | other | 0 | Repeats the pre-snap spot of the play before it | Nothing. Its `yardsToGoal` is stale |
| Sack (7) | 5 | pass | Signed loss (−3, −7, −9, −20) | Next start | Loss. Two ended in `TURNOVER ON DOWNS` (text only) |
| Passing Touchdown (67) | 5 | pass | Equals `yardsToGoal` (ends at 0) | Goal line. The next row is the kickoff at 65 | Score (`homeScore`/`awayScore` jump by 7) |
| Punt (52) | 5 | other | 0 | Next start, other team | Change of possession. Distance only in `playText` |
| Field Goal Good (59) | 3 | other | **Kick distance** (29 on ytg 11) | Next row is the kickoff | Score (+3) |
| End Period (2) | 3 | other | 0 | Stale spot | Quarter marker. `playText` `"End of 1st quarter."` |
| Interception (63) | 2 | other | 0 | Next start, other team | Turnover. The return is only in `playText` |
| Fumble Recovery (Own) (9) | 2 | rush | Signed | Next start | **Mislabelled once**: `…262` is a fumble *Coastal* recovered (text: "recovered by CCU"). The next play is Coastal's |
| Rushing Touchdown (68) | 1 | rush | Equals `yardsToGoal` | Goal line | Score (+7) |
| Punt Return (14) | 1 | other | Return yards (1) | Next start, other team | Change of possession |
| Fumble Recovery (Opponent) (29) | 1 | rush | Signed gain before the fumble | Next start, other team | Turnover. It first appeared as `Fumble` (69), see §4 |
| End of Game (66) | 1 | other | 0 | none | Final marker |

Also seen, but only in a play that was later retyped: **`Fumble` (69)**. [OBSERVED]

**Change of possession**, across all 181 plays (ESPN's `end.team` differing from
`teamId`): Kickoff 11, Punt 5, Timeout 3, Interception 2, Sack 2 (turnover on
downs), Fumble Recovery (Own) 1, Punt Return 1, Fumble Recovery (Opponent) 1.
The "Timeout" cases are timeouts that fell between a turnover on downs or a kick
and the next snap. [CROSS-CHECK]

## 3. Mapping `yardsToGoal` + `yardsGained` to start and end spots

- **Start spot** = `yardsToGoal` from `teamId`'s perspective. It matched ESPN's
  `start.yardsToEndzone` on 181/181 plays. To draw it on a fixed field, flip it
  for one of the two teams (`100 − yardsToGoal`). [OBSERVED] [CROSS-CHECK]
- **`start + yardsGained` is not the end spot.** Taking the next play as truth,
  `yardsToGoal − yardsGained` gave the right spot only for plain rushes and passes
  with no penalty and no timeout in between. It is wrong for every kick, return,
  turnover, score and penalty. [OBSERVED]
- **End spot = the next play's `yardsToGoal` for the next play's `teamId`.** It
  matched ESPN's `end` on 148 of 180 consecutive pairs. The 32 misses, all
  predictable: [CROSS-CHECK]
  - The next row is a **Timeout or End Period**, which repeats the old
    pre-snap spot (9 Rush, 1 Pass Reception, 2 Sack, 1 Punt). Skip those rows
    when you look for "next".
  - A **timeout** row's own end (9), because its "next" is the real snap.
  - **Touchdowns** (6): the end is the goal line and the next row is the
    kickoff from 65.
  - **Penalties** (2): one declined (`…197`), and one (`…368`) where ESPN's own
    end spot disagrees with the next snap. Plus period ends (2).
- **For the newest play**, there is no next play. Use the game header: its
  `yardsToGoal`/`down`/`distance` equalled ESPN's final end state for the last
  play in 26 of 30 in-play rounds. The 4 misses (pairA1, pairA3, r23, r26) were
  all plays that were later revised (§4), so the header was right about the
  version it served. But its `possession` names the **last play's team**, so after a
  kick or turnover you have to flip it yourself. Detect those from the playType
  (Kickoff, Punt, Punt Return, Interception, Fumble Recovery…) or from `playText`.
  [OBSERVED] [CROSS-CHECK]
- **Where no numeric field helps:** kick distance and landing spot (Kickoff,
  Punt), interception and fumble return yards, penalty direction and
  enforcement spot, and `NO PLAY`. All of these exist only in `playText` (e.g.
  `"kickoff 65 yards to the CCU00 #14 C.Hinton return 51 yards to the LIB49"`).
  An animation that shows the ball in the air needs a text parser, or has to
  jump straight to the end spot. [OBSERVED]

## 4. Revisions and removals

Every fetch was diffed against the previous one by play `id`. Full diffs are in
[`cfbd-live-plays/revisions.json`](cfbd-live-plays/revisions.json). [OBSERVED]

| First seen changed | Play | What changed |
|---|---|---|
| r07 pairA1 00:52:15Z | `…179` Pass Incompletion | `playText`: defender name (17 min after it first appeared) |
| pairA2 00:52:55Z | `…243` | **`Sack` → `Penalty`**. `yardsGained −4 → 10`, `clock 10:49 → 10:58`, `wallClock +47 s`, `epa −2.58 → null`, text gains "PENALTY CCU Holding … NO PLAY" |
| r07 00:56:16Z | `…253` Pass Reception | `epa`. Text gains "PENALTY CCU Roughing The Passer" |
| r12 01:42:15Z | `…409` Kickoff | `playText`: penalised player's name added |
| r23 03:01:29Z | `…640` Penalty | `playText`: enforcement spot `CCU19→CCU14` becomes `CCU21→CCU16` |
| r24 03:08:31Z | `…662` | **`Fumble` → `Fumble Recovery (Opponent)`**. `yardsGained 6 → 5`, `wallClock +130 s`, text gains "fumbled … recovered by CCU". The previous version read as a plain 6-yard Liberty run |
| r27 03:29:33Z | `…743` Sack | Text `"D. Bailey sacked"` → full description. **`yardsGained 0 → −20`**, `wallClock +120 s`, adds intentional grounding and `TURNOVER ON DOWNS` |
| r29 03:43:34Z | `…716` Pass Incompletion | `playText`: "short" → "short right" (after the final whistle) |

- **After the final:** `If-None-Match` with the r29 ETag returned 304 at
  03:58:50Z, so nothing changed in the first 15 minutes after `Final`. [OBSERVED]
- **Removed plays: none.** No id seen in one fetch was missing from a later one. [OBSERVED]
- **Late insertions: none.** Every new play had a later `wallClock` than
  everything already seen. [OBSERVED]
- **Consequence for the field.** The newest play can arrive as a placeholder
  (short text, 0 yards) and be rewritten minutes later into a different play
  type, a turnover, or NO PLAY. An animation keyed on play id has to be able to
  redo or undo the last few plays. Re-diffing the whole response on every fetch
  is the only way to see it, since there is no per-play version or updated-at
  field. (`wallClock` moved on 3 of the 8 revisions, but not on the others.)

## 5. Latency

- **`wallClock` is not the snap time.** It moved forward when a play was revised
  (+47 s, +120 s, +130 s above). It matched ESPN's `wallclock` exactly on every
  play, so it is the time the play was logged upstream. [OBSERVED] [CROSS-CHECK]
- **Age of the newest play at fetch** (fetch time − newest `wallClock`): minimum
  **32 s** (r09 01:21:12Z). In the 40-second triple (00:52:15–00:53:36Z) it was
  90 s, 48 s and 55 s. [OBSERVED]
- **Plays that were logged but not yet served:** 12 of 142 new plays had a
  `wallClock` 1–99 s *before* a fetch that did not include them. So CFBD's copy
  runs up to ~1.5 min behind the upstream log, on top of the log's own delay
  after the snap. [OBSERVED]
- **The injury stoppage.** Play stopped at Q1 3:05 after the 00:16:35Z kickoff,
  while an injured player was carted off. It was not a weather delay. [USER] The
  live feed and the scoreboard sat unchanged (same ETag, r01 00:20:52Z and r03
  00:28:14Z). The first play after the restart has `wallClock` 00:29:22Z. At
  00:30:19Z, the scoreboard still read Q1 03:05 with `lastPlay "(C. Reeves KICK)"`,
  even though play had resumed [USER]. A frozen clock looks exactly the same
  whether the cause is an injury, weather or a feed stall. That matters for #172's
  delay inference. [OBSERVED]
- Budget roughly **1–2 minutes** from the snap to the play being fetchable, and
  expect the newest play to be revised afterwards. Nothing measured sub-30 s.
  [OBSERVED]

## 6. Cost, size and caching

`x-calllimit-remaining` went from **74,795** (first scoreboard call) to **74,763**
(post15): **32 metered calls** in all. The per-call sequence is in `rounds.tsv`. [OBSERVED]

- **`/live/plays` is metered at 1 call per request**: 32 decrements across 33
  live calls. The one exception is r21 (02:47:26Z), which read 74,772, the same
  as r20. The scoreboard call just before it read 74,773, one *above* r20's live
  call. So the counter is not strictly monotonic, and one call was either free or
  counted late. Treat it as 1 per call. [OBSERVED]
- **`/scoreboard` is free**: every scoreboard call read the same value as the
  live call before it (31/31, apart from the r21 bump above). [OBSERVED] This
  confirms #267's finding.
- **Conditional requests work, but still cost a call.** Response headers carry a
  weak `ETag` (`W/"50c1-…"`) and no `Last-Modified` or `Cache-Control`
  (`cf-cache-status: DYNAMIC`). Sending the ETag back as `If-None-Match` 4 s later
  returned **`304`, no body, and `x-calllimit-remaining` down by 1** (74,794 →
  74,793, r02 00:20:56Z; headers in `headers-200-and-304.txt`). It happened again
  15 minutes after the final (post15 03:58:50Z: 304, 74,764 → 74,763). A 304 saves
  bandwidth, not quota. [OBSERVED]
- **The ETag changes whenever any play changes**, revisions included, so a
  matching ETag reliably means "nothing new". Across halftime (r12–r14), all three
  responses were byte-identical at 49,648 bytes. [OBSERVED]
- **Size:** 20.7 KB (39 plays, Q1) → 49.6 KB (99 plays, half) → 91.4 KB (181
  plays, final), about 0.5 KB per play. The server honours `Accept-Encoding`
  (`content-encoding: br` on `/scoreboard`), and the final response gzips to
  11.2 KB. [OBSERVED]
- **Budget:** polling one game every 60 s for 3.5 hours is ~210 calls. A
  15-game Saturday polled every 60 s while each game is live (~3.5 h) is
  ~3,150 calls, about 4% of the 75,000/month Tier 3 quota per Saturday, or
  ~16% for a 4-Saturday month. At 30 s that doubles. Polling only the game a
  member has open (the Game sheet) instead of every live game is the lever that
  matters. [OBSERVED: per-call cost; the rest is arithmetic]

## 7. `/scoreboard` versus `/live/plays`

| `/scoreboard` field | Observed | Relation to `/live/plays` |
|---|---|---|
| `possession` | `"home"`, `"away"` or `null` (6 home, 12 away, 14 null across the 32 in-progress snapshots of this game; `null` for all 2,310 scheduled entries and the completed one) | Points at the team **to snap next**, unlike the live header's team name, which points at the last play's team. It is `null` when `situation` is `null` (after kickoffs, timeouts, scores and quarter ends, and at halftime), except at r28 (end of game: `"away"`, `situation null`) |
| `situation` | `"2nd & 15 at LIB 43"`, `"4th & 26 at CCU 34"`, `null` | Human-readable next-snap down and distance, with the spot as a team abbreviation plus yard line |
| `lastPlay` | A play's `playText` (`"(01:42) Shotgun #2 D.Bailey pass incomplete…"`), or a short form for kicks (`"(C. Reeves KICK)"`), or `"End of 1st quarter."` | Same text source as the live `playText`, but usually an **older** play: the scoreboard clock was behind the live clock in 15 of 30 rounds and never ahead. In r24 03:08:31Z it still showed the *pre-revision* text of the fumble play (a plain 6-yard run), 7 minutes after the live feed had moved on |
| `status` | `in_progress` through halftime and until the final; `completed` at r29 | No halftime state. The live feed has `"Halftime"` and `"End of Period"` |
| `clock` | `"03:05"` (zero-padded) | The live feed uses `"3:05"` |

Scores agreed between the two in every round. [OBSERVED]

**#172, possession.** The raw value is `"home"` / `"away"` / `null` [OBSERVED].
The spec only says a nullable string [SPEC]. It is free to poll, but it is `null`
during many dead-ball moments and can lag the live feed by minutes. A
`WeekStateJson` field would be `possession: 'home' | 'away' | null`, with `null`
rendering as "no indicator".

### Where the data comes from [CROSS-CHECK]

ESPN's public summary for the same event, fetched after the final, has the same
181 play ids in the same order. `text` = `playText`, `wallclock` = `wallClock`,
`statYardage` = `yardsGained` and `start.yardsToEndzone` = `yardsToGoal`, on
181/181 plays. ESPN also exposes `end.yardsToEndzone`, `end.team` and a per-play
`modified` time, all of which CFBD drops. So CFBD's live plays are a
re-serving of ESPN's feed with CFBD's EPA and success metrics added. ESPN's
quirks (mislabelled fumble recoveries, revisions, stale timeout spots) come
through unchanged, and CFBD cannot be fresher than ESPN. This is an
inference from identical data, not a statement by CFBD.

## What's still unknown

1. **Only one game was captured, a Thursday game with no overtime, no safety, no
   blocked kick, no missed field goal, no two-point try and no kick-return
   touchdown.** Those `playType`s (`Safety`, `Blocked Punt`,
   `Field Goal Missed`, `Kickoff Return Touchdown`, `Two Point…`, overtime
   periods) are unseen. **Follow-up:** repeat the capture on Friday 2026-09-25
   (Army @ Temple 20:00Z, Howard @ Rutgers 23:00Z, Navy @ UAB 23:00Z) or on
   Saturday, ideally two games at once.
2. **Sub-minute latency.** Polls were ~7 min apart, apart from one 40 s triple. The
   32 s minimum age is a floor from sparse samples. A 15–20 s poll over a single
   drive (~20 calls) would give a real distribution.
3. **How long a play stays revisable.** The latest revision seen came 17 min after
   the play first appeared (`…179`), and one landed after the final (`…716`).
   Fifteen minutes after the final, a conditional request returned 304 (post15
   03:58:50Z), so nothing had changed by then. Overnight or next-day corrections
   were not checked.
4. **What the "five seconds" cache in the spec means for polling.** Two calls 4 s
   apart returned the same ETag, but that proves nothing either way.
5. **The r21 counter anomaly.** Whether one call was truly free or counted late
   is unexplained. It does not change the 1-call-per-request conclusion.
6. **Whether `/scoreboard` ever carries a delay state.** It showed `in_progress`
   and a frozen clock through the 13-minute injury stoppage. There was no weather
   delay to compare against.
7. **Whether `/live/plays` works for an FCS-vs-FBS game or one not on ESPN's
   feed.** Not tested.
