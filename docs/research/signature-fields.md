# Signature fields: which teams, and what's distinctive

Research date: 2026-10-05. Resolves [#396](https://github.com/MidfieldMafia/cfb-pickem/issues/396),
a sub-issue of the [Saturday Slate v4 roadmap](https://github.com/MidfieldMafia/cfb-pickem/issues/394).
Feeds [#397](https://github.com/MidfieldMafia/cfb-pickem/issues/397).

**Question.** Which 10–15 FBS home fields are distinctive enough to get a signature field on the
live-field graphic (a top-down field about 360px wide), and, for each, which of four elements
differ from a standard field: (1) turf colour, (2) yard-number spacing or style, (3) midfield
logo, (4) sideline border colour or pattern? End zones are out of scope. Also: does the app
store CFBD's `neutralSite` per game?

**Sources.** Athletics department sites (broncosports.com, emueagles.com, goccusports.com,
lsusports.net, fightingirish.com, alumni.uga.edu, news.osu.edu), local outlets that reported
on announcements and printed the release text (Idaho Press, KIVI, KMVT, WOWT, The Advocate,
SI team sites), SportsLogos.net for the WVU and Nebraska designs (each article embeds the
school's or AD's own reveal post), and this repo at `defded4`. Fetched 2026-10-05. Hex values
are the ones `src/lib/logos.json` already uses for each school, since those are the colours the
app paints with. No source gives a hex for any turf, so turf colours are described, not quoted.

**What "standard" means here.** Green turf, numbers every 10 yards in a plain block face, a team
logo at midfield, a white out-of-bounds border. Every FBS field has a midfield logo, so a logo
alone counts as distinctive only when its shape or colour would read at 360px.

## Answer

Twelve fields, in three tiers. Team ids are the `espnId` values in `logos.json`, which are also
CFBD's team ids (Georgia is 61 in both). Tiers are by how well they read at phone width. Tier 1 changes the whole
field; tier 2 changes a band or a pattern the eye picks up at a glance; tier 3 is a midfield mark
and little else, worth doing only if the per-team cost is low.

| # | Team (team id) | Turf | Numbers | Midfield | Sideline border | Tier |
|---|---|---|---|---|---|---|
| 1 | Boise State (68) | **Blue** | Jersey font; orange hash marks at the 2 and 11 (new 2026) | Bronco head | — | 1 |
| 2 | Coastal Carolina (324) | **Teal** | — | CCU logo | — | 1 |
| 3 | Eastern Michigan (2199) | **Gray** | — | EMU logo | — | 1 |
| 4 | LSU (99) | — | **Every 5 yards**, "Geaux" block face | Tiger eye (purple, gold, white) | — | 2 |
| 5 | West Virginia (277) | — | 2019 WVU typeface | Gold Flying WV | **Navy** out-of-bounds, end zones to the 25s | 2 |
| 6 | Nebraska (158) | — | — | Enlarged Block N | **Black** team areas; red out-of-bounds near the end zones | 2 |
| 7 | Texas A&M (245) | — | — | Maroon Texas outline behind ATM | **Maroon stripe** all round, white lettering | 2 |
| 8 | Georgia (61) | — | — | — | **Privet hedge** ring (dark green) | 2 |
| 9 | Notre Dame (87) | — | — | **Small** interlocking ND; no conference logos | — | 3 |
| 10 | Clemson (228) | — | — | Large **orange paw** | — | 3 |
| 11 | Texas (251) | — | — | Longhorn silhouette | — | 3 |
| 12 | Ohio State (194) | — | — | Block O, gray outer stroke; buckeye leaves at the 35s | — | 3 |

Only three FBS fields are not green. The other famous non-green fields are FCS or Division II
(Eastern Washington red, Central Arkansas purple and gray, New Haven blue) and never appear on
an FBS slate. LSU is the only FBS field numbered every five yards.

The `neutralSite` answer is at the end: **the app does not store it**, but the `/games`
response it already fetches carries it.

## The fields

### 1. Boise State — Albertsons Stadium, Lyle Smith Field

- **Turf: blue.** "The Blue", blue since 1986, "the first non-green artificial football field in
  the country". Brand blue `#0033A0`, orange `#D64309` (`logos.json`); the turf itself is a
  brighter, lighter blue than the brand navy-blue in every photo, so pick the turf shade by eye.
- **Replaced for 2026.** A new FieldTurf surface (the seventh iteration) went in June–July 2026,
  before Boise State's first Pac-12 season. The new design adds orange hash marks at the 2- and
  11-yard lines on both sides (for Ashton Jeanty and Kellen Moore), an outline of Idaho at both
  35s as the kickoff mark, and an all-white Pac-12 logo at both 25s. The 2019 surface already
  used a number font matching the jerseys.
- **Midfield:** the Bronco head.
- Sources: [broncosports.com, 2025-10-28](https://broncosports.com/news/2025/10/28/general-boise-state-athletics-receives-1-5m-gift-to-renew-iconic-field-at-albertsons-stadium);
  [Idaho Press on the 2026 design](https://www.idahopress.com/blueturfsports/football/new-blue-turf-field-to-honor-ashton-jeanty-kellen-moore-with-orange-markings/article_8adc7c78-88a3-4b80-ab46-cd61c02f345b.html);
  [KMVT, 2026-04-29](https://www.kmvt.com/2026/04/29/boise-state-adds-easter-eggs-honoring-past-players-they-replace-iconic-blue-turf/);
  [KIVI on the 2019 jersey font](https://kivitv.com/news/boise-state-introduces-new-blue-turf-at-albertsons-stadium);
  [Athletic Business on the midfield Bronco head](https://www.athleticbusiness.com/facilities/stadium-arena/article/15832827/progressive-insurance-logo-to-join-bronco-head-at-midfield-of-boise-states-albertsons-stadium).

### 2. Coastal Carolina — Brooks Stadium

- **Turf: teal** ("Surf Turf"), since 2015. Replaced for 2025 with a new teal surface and, for
  the first time, black end zones. School colours teal `#006F71`, bronze `#A27752`.
- **Midfield:** the team logo at the 50.
- Sources: [goccusports.com, 2025-09-03](https://goccusports.com/news/2025/9/3/football-know-before-you-go-coastal-carolina-unveils-enhanced-game-day-experience-for-2025-home-opener.aspx);
  [Post and Courier on the 2025 replacement](https://www.postandcourier.com/myrtle-beach/news/coastal-carolina-turf-field-auction-sell-gift/article_9aafcb16-ff60-11ef-bf18-23f7265eea8d.html).

### 3. Eastern Michigan — Rynearson Stadium ("The Factory"), Maxx Crosby Field

- **Turf: gray,** since 2014, chosen for an industrial look. The original gray surface was pulled
  in spring 2024 and replaced with "a new gray playing surface", with the track removed. School
  green `#006633`.
- **Midfield:** EMU logo (not separately sourced; standard).
- Source: [emueagles.com, 2024-03-29](https://emueagles.com/news/2024/3/29/football-rynearson-stadiums-original-gray-turf-era-comes-to-a-close).

### 4. LSU — Tiger Stadium

- **Numbers every 5 yards,** since 1946, at a radio announcer's request; "LSU appears to be the only
  major college" that does it. The numerals are a custom block face the grounds crew calls the
  "Geaux" font. Natural grass, so the field is repainted weekly.
- **Midfield:** the Tiger Eye, painted freehand in white, purple, then gold. Purple `#461D7C`,
  gold `#FDD023`.
- Sources: [lsusports.net, 2021-10-15](https://lsusports.net/news/2021/10/15/why-does-lsu-football-paint-5-yard-numerals/);
  [WAFB on the weekly paint and the Geaux font](https://www.wafb.com/2023/09/25/how-lsu-grounds-crew-prepares-tiger-stadium-gameday);
  [The Advocate on the Tiger Eye](https://www.theadvocate.com/baton_rouge/sports/lsu/time-lapse-watch-as-lsus-tigers-eye-logo-is-brought-to-life-in-death-valley/article_71f34aec-a2e2-11e6-93a1-efb71495e541.html).

### 5. West Virginia — Milan Puskar Stadium, Mountaineer Field

- **Sideline border: navy.** New for 2025: the out-of-bounds area behind the end zones and down
  both sidelines as far as the team areas at the 25s is navy blue; it had been white since 1988.
  Two parallel stripes, after the uniform pants stripe, flank the end-zone wordmarks (end zone,
  so out of scope).
- **Numbers:** redrawn in the 2019 WVU typeface.
- **Midfield:** a gold Flying WV, there since 1997 and enlarged in 2016. Navy `#002855`, gold
  `#EAAA00`.
- Source: [SportsLogos.net, 2024-11-27](https://news.sportslogos.net/west-virginia-mountaineers-unveil-new-turf-design-for-milan-puskar-stadium),
  embedding @WVUfootball's reveal.

### 6. Nebraska — Memorial Stadium, Tom Osborne Field

- **Sideline border: black team areas,** with a red out-of-bounds area from the 20-yard lines to
  the end zones and "Tom Osborne Field" on both sidelines. The 2022–24 field was ringed in white.
- **Midfield:** a larger Block N. Red `#E41C38`.
- **Temporary.** This Hellas surface went in for 2025 and is meant to last only until the
  stadium renovation finishes (targeted for 2028), when Memorial Stadium returns to natural
  grass. Expect it to change.
- Sources: [SportsLogos.net, 2025-05-30](https://news.sportslogos.net/2025/05/30/nebraska-cornhuskers-install-new-temporary-turf-at-memorial-stadium/college/),
  embedding AD Troy Dannen's reveal; [WOWT, 2025-05-29](https://www.wowt.com/2025/05/29/huskers-unveil-new-look-tom-osborne-field/).

### 7. Texas A&M — Kyle Field

- **Sideline border: a maroon stripe around the whole field,** with "Home of the 12th Man" and
  "G.R.I.N.D." in white inside it. Introduced for the 2024 opener.
- **Midfield:** ATM over a maroon outline of Texas. Maroon `#500000`.
- **One-week variant:** for the 2025 "Black Out" game (Mississippi State, 2025-10-04) the stripe,
  end zones and midfield background were painted black. A signature field should use maroon.
- Sources: [NBC DFW, 2024](https://www.nbcdfw.com/news/local/texas-am-transforms-kyle-field/4024927/);
  [SI All Aggies, 2025-10-02](https://www.si.com/college/tamu/football/texas-am-debuts-new-look-for-kyle-field-ahead-of-black-out-game),
  which also confirms the maroon sidelines were the 2025 default.

### 8. Georgia — Sanford Stadium, Dooley Field

- **Sideline border: the hedges.** Five-foot Chinese privet rings the field and has since 1929;
  the current hedges were replanted in 2024. Strictly they sit beyond the out-of-bounds area, but
  at 360px a dark-green ring around the field is the one thing that reads as Sanford. Red
  `#BA0C2F`.
- **Midfield:** the G (standard; not separately sourced).
- Source: [UGA Alumni, 2024-03-20](https://alumni.uga.edu/2024/03/20/about-behind-and-between-the-hedges/).

### 9. Notre Dame — Notre Dame Stadium

- **Midfield: deliberately small.** The interlocking ND, "less than 10 yards wide", went in with
  FieldTurf in 2014; green shamrocks mark the 35s. As an independent, the field carries no
  conference logo at the 25s. The signature is restraint: a bare field with a small navy-and-gold
  mark. Navy `#0C2340`, gold `#C99700`.
- Source: [fightingirish.com, 2014](https://fightingirish.com/fieldturf-details-set-for-coming-notre-dame-stadium-installation).
  No later redesign was found.

### 10. Clemson — Memorial Stadium, Frank Howard Field

- **Midfield: a large orange Tiger Paw** on natural Bermuda grass, the gathering point of the
  "Gathering at the Paw" tradition. Orange `#F56600`.
- Source: [South Carolina Encyclopedia, "Death Valley"](https://www.scencyclopedia.org/sce/entries/death-valley/)
  (a university-published encyclopedia; no clemsontigers.com field page was found).

### 11. Texas — Darrell K Royal–Texas Memorial Stadium, Campbell-Williams Field

- **Midfield: the Longhorn silhouette,** the most recognisable single shape in the set. FieldTurf
  since 2009; SEC logos added 2024. Burnt orange `#BF5700`.
- Sources: [SI Longhorns, Dec 2024](https://www.si.com/college/texas/football/look-texas-longhorns-reveal-dkr-field-design-ahead-of-college-football-playoff-01jfg7fzqcsg);
  [Burnt Orange Nation on the SEC logos](https://www.burntorangenation.com/2024/5/23/24163618/sec-logo-texas-longhorns-darrell-k-royal-texas-memorial-stadium-campbell-williams-field).

### 12. Ohio State — Ohio Stadium

- **Midfield: the Block O,** its outer strokes recoloured gray in the current design; buckeye leaves
  replace the X marks at the 35s. Scarlet `#BB0000`.
- Source: [news.osu.edu, "New Ohio Stadium turf follows traditional lines"](https://news.osu.edu/new-ohio-stadium-turf-follows-traditional-lines/).

## Considered and left out

- **Penn State, Tennessee, Oregon, Washington State.** Midfield logo only, or the distinctive part
  is the end zone (Tennessee's checkerboard, WSU's two-tone end zones). Oregon's last redesign
  went simpler.
- **Northwestern.** The new Ryan Field opens in 2026; no field design was published.
- **Two April Fools' stories** surface in searches and read as real: Penn State "switching to navy
  blue turf" ([Penn State Student Media, 2024-04-01](https://bellisariostudentmedia.psu.edu/story/beaver-stadiums-stadium-renovation-includes-changing-from-grass-to-artificial-turf))
  and LSU "purple FieldTurf in '10" (lsusports.net, 2010-04-01). Neither happened.

## Does the app store `neutralSite`?

**No.** CFBD sends it and the app throws it away.

- `CfbdGame.neutralSite` and `CfbdScoreboardGame.neutralSite` are typed in
  `src/lib/cfbd/types.ts` (lines 16 and 162), and `scoreboardOf` in `src/lib/cfbd/recorded.ts`
  copies it, but only for fixtures.
- `toCandidate` in `src/lib/cfbd/candidates.ts` drops it (and `venueId`) when it turns a
  `CfbdGame` into a `CandidateGame`. `addGame` in `src/lib/slate/slate.ts` writes only what the
  candidate carries.
- The `games` table in `src/db/schema.ts` has no column for it, and `GameDetail`
  (`src/lib/detail.ts`, the `games.detail` jsonb) holds only the venue *name* and city.

**Where it would come from.** The `/games` call that `weekCandidates` already makes
(`src/lib/cfbd/http.ts:74`). Two ways to keep it:

1. **On `GameDetail`** (`neutralSite: boolean`). No migration. The daily refresh rewrites
   `detail` until kickoff, so every not-yet-started game picks it up within a day; started games
   keep a detail without it, which should read as "not neutral".
2. **As a `games.neutral_site` column.** Typed, queryable, but needs a migration and a backfill.

**Caveats.**

- The app asks for `seasonType: "regular"` only (`http.ts:71`), so bowl and playoff games never
  reach a slate today. The neutral games it does see are regular-season ones: Week 0/1 kickoff
  games (the recorded 2026 Week 1 fixture has TCU–North Carolina at Aviva Stadium, Dublin, and
  Auburn–Baylor at Mercedes-Benz Stadium, both `neutralSite: true`) and rivalry games such as
  Texas–Oklahoma in Dallas.
- `neutralSite: false` does not guarantee the home team's own stadium: a school can move a home
  game to an NFL venue. The strict test is `game.venueId === homeTeam.location.id`, with
  `location.id` from CFBD's `/teams` (documented in `docs/research/collegefootballdata-api.md`,
  section (e)). The client does not call `/teams` today, so this costs one more endpoint; a
  12-entry map from team id to home venue id hard-coded beside the signature fields would also
  do.

## Surprises

- **Boise State's field changed this summer** (new surface, Pac-12 logo, orange hash marks), and
  `src/lib/logos.json` still lists Boise State as Mountain West.
- **Nebraska's design is temporary,** due to go back to grass around 2028.
- **Two of the four elements are rare.** Only three FBS fields have non-green turf and only LSU
  numbers every five yards; most of the list is carried by midfield logos and sideline bands.
