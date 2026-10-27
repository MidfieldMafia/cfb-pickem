# Slate suggester: what past slates say about how a slate is chosen

Research for #499 (map #491, Saturday Slate v5). It feeds #500, the prototype
of a suggester in the console's Slate builder.

Researched 2026-10-26. Each claim carries one label:

- **[CODE]**: this repo at `d3543f9` (main).
- **[DB]**: read-only `SELECT`s against the shared Neon **Development** branch
  (`DATABASE_URL` in `.env.local`), run inside a `readOnly` transaction.
- **[OBSERVED]**: real CFBD calls made for this ticket with the project's Tier 3
  key. There were 4, all metered (`x-calllimit-remaining` 71,713 → 71,710).
- **[SPEC]**: CFBD's live OpenAPI spec, `https://api.collegefootballdata.com/api-docs.json`
  (version **5.33.1** at fetch time).
- **[INFERENCE]**: my reading of the facts above, not a fact itself.

Production was **not** read. Its `main` branch is behind `POSTGRES_URL`, and a
prod read needs Jonah's say-so first.

## Summary

- **No slate history worth fitting exists in the Development database.** It holds 2
  published Weeks with 3 and 4 games. Both are test data: Week 2 is three FCS
  cupcakes, and Week 4's four games all kick off at the same instant. [DB]
- **Production has at most about 8 real slates of 10 games.** They cover 2026 Weeks
  2–9, with Week 9 being built now. That number is not verified: it comes from the
  season timeline and the Oct 3 check, which read 10 prod games. It needs one prod
  read. [INFERENCE]
- **Nothing stores the games a commissioner did not pick.** `games` holds only the
  slate. The candidate list comes live from CFBD on every Slate builder render and
  is never kept. Learning "what predicts selection" means rebuilding each past
  Week's candidates from CFBD. [CODE]
- **Each Week offered 56–99 candidates** from CFBD's FBS feed, and 49–59 of them
  were FBS against FBS (the builder's default view). So 8 slates are about **80
  chosen games out of about 450–520 candidates**. [OBSERVED]
- **A hand-weighted scorer with reasons is the right first version.** 80 picks made
  by two people, with no stored candidate set, could only fit a handful of weights.
  Those weights would explain themselves worse than "both ranked · spread 3". The
  suggester should log what it suggested next to what was chosen, so that a fit
  becomes possible next season. [INFERENCE]
- **The suggester costs no extra CFBD calls.** `weekCandidates` already reads 10
  endpoints per uncached render. Every feature below is in that payload except
  rivalry and favourite teams, which CFBD does not have. [CODE] [SPEC]
- **On build day the coming Week's feed is complete.** On Monday 2026-10-26, Week 9
  (Oct 27 – Nov 1) had 56/56 kickoff times set, 56/56 lines posted and 46/56 TV
  outlets. Week 10, one week further out, had only 6/63 lines and 14/63 TV. [OBSERVED]

## 1. How many slates, and how many candidates

### Development database [DB]

| Week | Published | Games | Deadline (UTC) |
| --- | --- | --- | --- |
| 1 | no | 0 | none |
| 2 | yes | 3 | 2026-09-11 00:00 |
| 4 | yes | 4 | 2026-09-26 16:00 |

There is one season (2026), there are 7 games in all, 3 members (none with a team
Pennant) and 1 group. This is what Chrome verification and the seed left behind,
not a commissioner's choices. Week 2 is Florida A&M at Miami, Norfolk State at
Virginia and Villanova at Louisville. Week 4 is four games all set for 16:00 UTC:
Texas at Tennessee, Illinois at Ohio State, San Diego State at Toledo, and Virginia
Tech at Boston College. **Do not draw anything about selection from it.**

### Production [INFERENCE]

There was no prod read. What the repo and its history say:

- A slate is 10 games. The Oct 3 field check (#352) read "all 10 games" with
  `check-field --prod`.
- Prod got its 2026 season on 2026-09-05, after Week 1 had been played. Boards
  read "after Week 2" by mid-September (PR #162's notes). So the real slates are
  Weeks 2–8 played, plus Week 9 if it is published by now: **7 or 8 slates**.
- Counting them takes one read-only query against prod
  (`select week_number, count(*) from games join weeks … group by 1`), and Jonah
  has to allow it.

### Candidates per Week, 2026 [OBSERVED]

One call, `GET /games?year=2026&seasonType=regular&classification=fbs`. This is
the same filter `cfbd.games` uses (`src/lib/cfbd/http.ts`), so these are exactly
the rows the Slate builder lists before its pills.

| Week | All | FBS v FBS | One side AP-ranked | Both ranked | P4 v P4 | Line ≤ 7 | No line yet | ABC/CBS/NBC/FOX/ESPN | P4 v P4 and ≤ 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 99 | 51 | 25 | 1 | 10 | 16 | 0 | 22 | 7 |
| 2 | 86 | 49 | 24 | 1 | 16 | 18 | 0 | 13 | 9 |
| 3 | 75 | 57 | 22 | 3 | 19 | 23 | 0 | 16 | 9 |
| 4 | 71 | 58 | 18 | 6 | 24 | 26 | 0 | 18 | 12 |
| 5 | 59 | 56 | 16 | 3 | 26 | 30 | 0 | 16 | 13 |
| 6 | 58 | 58 | 19 | 2 | 25 | 30 | 0 | 13 | 12 |
| 7 | 62 | 59 | 16 | 6 | 27 | 34 | 0 | 12 | 15 |
| 8 | 56 | 56 | 17 | 2 | 27 | 27 | 0 | 11 | 11 |
| 9 | 56 | 56 | 18 | 2 | 28 | 28 | 0 | 10 | 13 |

The Week 2 count (86) matches the recorded fixture
`src/lib/cfbd/fixtures/2026-week-2/games.json`. Ranks are AP Top 25, from the
latest poll on or before the Week, as `rankLookup` does it. Lines are the first
book with a spread, as `bookLines` does it. "P4" is SEC, Big Ten, ACC and Big 12,
the Slate builder's four conference pills. The ranked, line and TV columns use the
**current** feed, so for past Weeks they show closing lines and final TV, not what
the commissioner saw on build day.

What the table says for a scorer [INFERENCE]:

- **"Both ranked" is rare: 1–6 games a Week.** When it happens it should almost
  always be on the slate, so it can carry a heavy weight without crowding anything
  out.
- **"Close and between power-conference teams" gives 7–15 games**, about the size
  of a slate. That makes it a reasonable backbone for the score.
- **The network-TV games number 10–22**, and they overlap heavily with the two sets
  above. TV works as a tiebreak, not a driver.

## 2. Which features predict selection

The question can't be answered empirically from what exists (§1). Below is what
each candidate feature is, where it comes from, and whether it is in hand on build
day. The weights are for #500 to prototype and Jonah to judge.

| Feature | Source on build day | Extra calls | Notes |
| --- | --- | --- | --- |
| Spread | `detail.spread` / `spreadValue`: book line, else the pregame win-probability model's spread [CODE] | 0 | All 56 of Week 9's lines were posted by Monday [OBSERVED] |
| Both / one ranked | `homeRank`, `awayRank` from `/rankings` [CODE] | 0 | Sunday's poll is out by build day. `rankLookup` takes the latest poll ≤ week [CODE] |
| Conference | `homeConference`, `awayConference`; `conferenceGame` on `/games` [SPEC] | 0 | `conferenceGame` is in the `/games` payload but not on `CandidateGame` yet |
| FBS v FBS | `homeClassification`, `awayClassification` [CODE] | 0 | Already the builder's default filter |
| Kickoff window | `kickoff`, `kickoffTbd` [CODE] | 0 | Week 9: 0 TBD on Monday. Week 10: 40/63 TBD [OBSERVED] |
| TV | `detail.tv` from `/games/media` [CODE] | 0 | 46/56 for the coming Week on Monday [OBSERVED] |
| Team quality | `homePregameElo`, `awayPregameElo` on `/games` [SPEC] [OBSERVED] | 0 | In the payload (63/63 even for Week 10), not on `CandidateGame` yet |
| Records, points | `detail.home/away` (record, points and yards per game) [CODE] | 0 | Already snapshotted |
| Rivalry | **none** | n/a | CFBD has no rivalry field. `notes` carries only kickoff-classic names and SEC "FLEX" windows [SPEC] [OBSERVED]. Needs a hand-kept list |
| A Group's favourite teams | **partial**: a member's Pennant can be `team-<espnId>` (`members.avatar_id`) [CODE] | 0 (DB) | `src/lib/logos.json` maps `espnId` to school. Dev has 0 such Pennants [DB]. Every group plays the **same** Slate (GLOSSARY), so this is a league-wide count, not per Group |

Two rules the scorer has to respect, from the code rather than taste [CODE]:

- **The Deadline defaults to the earliest kickoff on the slate** (GLOSSARY
  "Deadline"). Week 9 has 10 games before Saturday (Tue–Fri). Suggesting one of
  them moves the whole Week's lock up to that night. The scorer should leave
  pre-Saturday games out unless the commissioner asks for them.
- **A slate is a set, not ten separate yes/no picks.** Ten noon SEC games score
  well one at a time and make a poor Saturday. Choosing the top 10 greedily, with
  a penalty for repeating a kickoff window or conference, fits that better than a
  plain sort. [INFERENCE]

## 3. Fit or hand-weight

**Hand-weight, and log.** [INFERENCE] The reasons:

- **Volume.** About 80 chosen games against about 450 that were not. The usual 10
  events per variable would allow 5–8 features, but only if the 80 were
  independent. They are not: they come from two people over about 8 Saturdays, and
  each Week's ten are chosen together.
- **The negatives can only be rebuilt with drift.** The build-day candidate list
  was never stored (§1). It can be re-fetched for a whole season in **4 calls**
  (`/games`, `/rankings`, `/lines`, `/games/media` with `year` only, which is how
  §1 was made). But those calls return closing lines and final TV, not what was on
  screen.
- **Reasons beat a fitted coefficient.** The ticket wants "both ranked, spread 3".
  A hand-weighted sum gives each reason its points directly, and a commissioner
  can disagree with one reason without distrusting the whole thing.
- **The way to a fit is to log.** When #500 builds the real thing, it should store
  each suggestion with its features and whether the game ended up on the slate.
  A full season of that is about 13 Weeks: about 130 chosen games
  against about 700 build-day candidates that were not chosen, each recorded as
  the commissioner saw it. A one-off retrospective check of the hand weights is cheap now: 4 CFBD
  calls plus one prod read, once Jonah allows the read.

A starting weight set for #500 to try [INFERENCE, untested]:

- both teams ranked: +4
- one team ranked: +2
- |spread| ≤ 3: +3
- |spread| ≤ 7: +2
- |spread| > 17: −2
- both P4: +1
- network TV: +1
- a league member's Pennant team: +1 each, at most +2
- kickoff before Saturday: excluded
- after the top pick, −1 for each slate game already in the same window

## 4. CFBD cost

- **Per Slate builder render: 10 metered CFBD calls plus 1 Open-Meteo call**, all
  from `weekDetails`: `/games`, `/rankings`, `/lines`, season `/games`,
  `/records`, `/stats/season`, `/games/media`, `/metrics/wp/pregame`, `/venues`
  and `/games/weather`. [CODE] `cachingCfbd` keeps each in process memory for the
  TTL. The Refresh button empties it. [CODE]
- **A suggester that scores `weekCandidates`' output adds 0 calls.** Adding
  `conferenceGame` and pregame Elo to `CandidateGame` is a mapping change on a
  payload already fetched. [CODE] [SPEC]
- **Optional extras**, each one call per season and cacheable for the season:
  `/ratings/sp`, `/ratings/elo`, `/ratings/fpi`, `/talent`. `/teams/matchup` is
  one call per team pair, which is too many for every candidate. [SPEC]
- **Against Tier 3's 75,000 a month, none of this counts.** The account had 71,713
  calls left on 2026-10-26, near the end of the month. [OBSERVED]

## Open questions for #500

- How many real slates prod holds, and whether their picks bear out the weights
  above. That takes one prod read with Jonah's go-ahead, plus the 4 calls from §3.
- Whether the commissioners want a rivalry list kept in the repo, and who keeps it.
- Whether "favourite teams" should come from members' team Pennants (available
  now) or from an explicit setting that doesn't exist yet.
- How the latest difficulty Poll should shift the spread weights. This is on map
  #491's "Not yet specified" list.
