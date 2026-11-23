# Rivalry Week: the Week 13 rivalry games and their trophy names

Research date: 2026-11-23. Resolves [#584](https://github.com/MidfieldMafia/cfb-pickem/issues/584),
a sub-issue of the [Rivalry Week and the Regular Season Champion](https://github.com/MidfieldMafia/cfb-pickem/issues/583)
map.

**Question.** Which FBS games in Week 13 of 2026 (Thanksgiving Thursday 11/26 through Saturday
11/28) are named rivalries, and what is each one's rivalry name and trophy (or none)?

**Sources.** Each game's date and kickoff come from the host school's 2026 football schedule, and
from the visiting school's where it could be read, fetched on 2026-11-23. Sidearm sites serve a plain
table at `/sports/football/schedule/text`, and WMT sites (Iowa, Clemson, Virginia Tech, LSU) were
read at `/sports/football/schedule/`. FBSchedules' "Slate finalized for Rivalry Week 2026" (published
2026-11-23) was used only to list the whole week, so that no game was missed. Every rivalry kept here
was then confirmed on a school site. CollegeFootballData was not used: it answers 401 without a key.
ESPN was not used.

The draft data file is [`rivalry-week-13.json`](rivalry-week-13.json). Each entry is
`{home, away, day, rivalry, trophy, source}`. Team names are the `school` values in
`src/lib/logos.json`, and the script that wrote the file checked every one against it.

## Answer: 19 named rivalries

Kickoff times are local, as each school's site gives them.

| Day | Away at Home | Rivalry | Trophy | Kickoff |
|---|---|---|---|---|
| Thu 11/26 | TCU at Texas Tech | Battle for the Saddle | Saddle Trophy | 7 p.m. CT |
| Fri 11/27 | Mississippi State at Ole Miss | Egg Bowl | Golden Egg | 11 a.m. CT |
| Fri 11/27 | Nebraska at Iowa | Heroes Game | Heroes Trophy | 11:08 a.m. CT |
| Fri 11/27 | Florida at Florida State | Sunshine Showdown | none (see below) | 3:30 p.m. ET |
| Fri 11/27 | Minnesota at Wisconsin | Battle for Paul Bunyan's Axe | Paul Bunyan's Axe | 6:30 p.m. CT |
| Fri 11/27 | Texas at Texas A&M | Lone Star Showdown | none (see below) | 6:30 p.m. CT |
| Sat 11/28 | Louisville at Kentucky | Governor's Cup | Governor's Cup | noon ET |
| Sat 11/28 | Michigan at Ohio State | The Game | none | noon ET |
| Sat 11/28 | Illinois at Northwestern | Land of Lincoln Trophy game | Land of Lincoln Trophy | 11:30 a.m. CT |
| Sat 11/28 | LSU at Arkansas | Battle for the Golden Boot | The Golden Boot | TBD, 11 or 11:45 a.m. CT |
| Sat 11/28 | Kansas State at Iowa State | Farmageddon | none | 1 p.m. CT |
| Sat 11/28 | South Carolina at Clemson | Palmetto Bowl | Palmetto Bowl Trophy | 3 p.m. ET |
| Sat 11/28 | Virginia at Virginia Tech | Commonwealth Clash | Commonwealth Cup | 3 p.m. ET |
| Sat 11/28 | Georgia Tech at Georgia | Clean, Old-Fashioned Hate | Governor's Cup | 3:30 p.m. ET |
| Sat 11/28 | USC at UCLA (Rose Bowl) | Battle for the Victory Bell | Victory Bell | 12:30 p.m. PT |
| Sat 11/28 | Purdue at Indiana | Battle for the Old Oaken Bucket | Old Oaken Bucket | 7 p.m. ET |
| Sat 11/28 | Auburn at Alabama | Iron Bowl | none | 6:30 p.m. CT |
| Sat 11/28 | Arizona State at Arizona | Territorial Cup | Territorial Cup | 7 p.m. MST |
| Sat 11/28 | Nevada at UNLV (Allegiant Stadium) | Battle for Nevada | Fremont Cannon | 6 p.m. PT |

Six of the 19 are on Thursday or Friday, and one of them, the Thursday game, kicks off before the
map's Friday Deadline (see below).

## Uncertainties to settle before the slate goes up

- **The Thursday game and the Deadline.** The Deadline defaults to the earliest kickoff on the slate
  (GLOSSARY.md). The map's Friday 11/27 11:00 is the Egg Bowl kickoff (11 a.m. CT). Nebraska at Iowa
  starts eight minutes later. Putting TCU at Texas Tech (Thursday 7 p.m. CT) on the slate would pull
  the Deadline back to Thursday night, so the map's Deadline holds only if the slate leaves it off.
- **Florida–Florida State trophy.** FBSchedules (June 2023) names a "Makala Trophy", which goes to
  the winner at a banquet in St. Petersburg, not on the field. No school site confirmed that it is
  still awarded, so the file has `null`. The state's three-way Florida Cup is not a trophy for this
  game alone.
- **Texas–Texas A&M trophy.** The "Cotton Holdings Lone Star Showdown" trophy is awarded across up to
  19 sports (texaslonghorns.com, 2025-04-30). The football game alone does not win it, so the file
  has `null`.
- **Iron Bowl.** There is no traveling trophy. The Foy–ODK Sportsmanship Trophy goes to the winning
  school's student government, not to the team, so the file has `null`.
- **Rivalries named after their trophy.** Several have no name apart from the trophy, so the file
  uses "Battle for the X", or "Land of Lincoln Trophy game" for Illinois–Northwestern. If the build
  shows one line per game, it can show the trophy alone when the rivalry name only repeats it.
- **Sponsor names are left out.** The schools bill some of these games with a sponsor: the "Pioneer
  Heroes Game", the "Smithfield Commonwealth Clash", and a Facebook-presented Egg Bowl. The file uses
  the plain names.
- **Palmetto Bowl trophy.** The game was named "The Palmetto Bowl" in 2014, and a trophy of that name
  replaced the Hardee's Trophy in 2015 (gamecocksonline.com, Nov 2014). Clemson's schedule bills the
  game as part of the "Palmetto Series". That is a separate all-sports series, so it is not used here.
- **Trophies not re-checked on a school site this session.** The Axe, Governor's Cup (both),
  Victory Bell, Old Oaken Bucket and Territorial Cup are long-standing and their game dates were
  confirmed, but no school page named the trophy itself. The Golden Egg, Land of Lincoln Trophy,
  Golden Boot, Fremont Cannon and Saddle Trophy were confirmed on school sites from the 2025 games
  (2019 for the Saddle).
- **Week 13 in the app vs. in the schedule.** FBSchedules lists two MAC games on Tuesday 11/24, Kent
  State at Eastern Michigan and Miami (OH) at Western Michigan. Neither is a named rivalry, and both
  fall outside Thursday to Saturday. FBSchedules also says there are two Thursday games but lists
  only TCU at Texas Tech. No second Thursday FBS game was found.

## Games that week that are left out

These are rivalries in a loose sense, but none has a current official name or trophy: NC State at
North Carolina, Tennessee at Vanderbilt, Washington at Oregon, Duke at Wake Forest, Penn State at
Maryland, and Oklahoma at Missouri (the old Peace Pipe trophy is retired). The rest of the FBS slate
(about 50 games) has no named rivalry.

## Sources

- School schedules (2026), fetched 2026-11-23: texastech.com, olemisssports.com, hailstate.com,
  hawkeyesports.com, seminoles.com, floridagators.com, uwbadgers.com, gophersports.com, 12thman.com,
  texassports.com, gocards.com, ohiostatebuckeyes.com, mgoblue.com, fightingillini.com,
  lsusports.net, cyclones.com, kstatesports.com, clemsontigers.com, hokiesports.com,
  georgiadogs.com, usctrojans.com, iuhoosiers.com, rolltide.com, arizonawildcats.com,
  unlvrebels.com, nevadawolfpack.com.
- [FBSchedules: College football TV schedule, slate finalized for Rivalry Week 2026](https://fbschedules.com/college-football-tv-schedule-slate-finalized-for-rivalry-week-2026/)
  (2026-11-23), used only to list the whole week.
- [Texas Tech: Battle for the Saddle Trophy](https://texastech.com/news/2019/11/14/football-through-the-smoke-battle-for-the-saddle-trophy)
- [Florida State: Sunshine Showdown](https://seminoles.com/sunshine-showdown)
- [Texas: Cotton Holdings Lone Star Showdown trophy (all sports)](https://texaslonghorns.com/news/2025/4/30/texas-athletics-clinches-2024-25-cotton-holdings-lone-star-showdown-trophy)
- [Ole Miss: 2025 Egg Bowl postgame notes](https://olemisssports.com/news/2025/11/28/football-postgame-notes-vs-mississippi-state)
- [Illinois: 2025 Land of Lincoln Trophy win](https://fightingillini.com/news/2025/11/29/football-illinois-wins-whiteout-for-the-hat-20-13)
- [LSU: The Boot](https://lsusports.net/boot)
- [Nevada: 2025 Fremont Cannon game](https://nevadawolfpack.com/news/2025/11/29/football-nevada-closes-season-with-loss-to-unlv.aspx)
- [South Carolina: The Palmetto Bowl (2014)](https://gamecocksonline.com/?p=45800)
- [FBSchedules: rivalry trophies that honor animals (Makala Trophy)](https://fbschedules.com/call-of-the-wild-8-fbs-college-football-rivalry-trophies-that-honor-animals/)
