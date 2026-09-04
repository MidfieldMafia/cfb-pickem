# Saturday Slate

A private college football pick'em for one group of friends and family. Each week the commissioners post a slate of games, members pick straight-up winners on their phones, and the app grades picks from real scores and keeps a season leaderboard.

## Language

### People

**Member**:
A person who plays. Every member belongs to the one site-wide group; there are no leagues.
_Avoid_: User, player, account, participant

**Commissioner**:
A member with the extra power to build slates, manage members, and correct picks or results. Jonah and Alex.
_Avoid_: Admin, owner, organizer

**Magic Link**:
A member's permanent personal URL containing a secret token. Opening it signs that member in on that device. A commissioner can regenerate it, which invalidates the old one.
_Avoid_: Invite link, login link, activation link

### Time

**Season**:
One college football year, e.g. 2026. Holds weeks and the season leaderboard. Only one season is active at a time.

**Week**:
One round of the game inside a season, matching a CollegeFootballData week number. Carries a slate, a deadline, and a weekly result.

**Deadline**:
The instant the week's picks lock. Defaults to the earliest kickoff on the slate; a commissioner may move it earlier, never later. Enforced on the server clock.
_Avoid_: Lock time, cutoff, close

**Reveal**:
The state after the deadline when every member's picks are visible to every other member.

### The game

**Slate**:
The set of about ten games the commissioners choose for a week. Published as a whole; members see nothing until it is published.
_Avoid_: Schedule, card, board

**Game**:
One matchup on a slate, backed by a CollegeFootballData game and its live score.
_Avoid_: Match, matchup, fixture

**Tiebreaker Game**:
The one slate game the commissioners flag for the week's tiebreaker.

**Pick**:
A member's choice of the winning team in one game. Saved the moment it is tapped; there is no submit step.
_Avoid_: Prediction, bet, entry, selection

**Lock of the Week**:
The one pick per week a member marks for double points. Optional; at most one per member per week.
_Avoid_: Lock, confidence pick, best bet

**Tiebreaker Guess**:
A member's predicted combined final score of the Tiebreaker Game for the week.

**Void**:
A game that will not count for anyone because it was canceled or postponed after the slate was published. A void game scores zero for everyone and drops any Lock placed on it.

**Result Override**:
A commissioner's manual correction of a game's final score or void status, taking precedence over the data feed.

### Scoring

**Rules**:
The scoring parameters for a season: points per correct pick, Lock multiplier, and tiebreak order. Rules are inputs to scoring, never baked into stored totals.

**Weekly Score**:
A member's points for one week, computed from picks, results, and rules on every read; never stored.

**Weekly Win**:
Having the highest Weekly Score for a week. Ties break by Tiebreaker Guess closeness, then are shared.

**Leaderboard**:
The season standings: total points, record, weekly wins, and average points per week played, ordered by the season tiebreak rules.
_Avoid_: Standings, rankings, table

**Live Board**:
The Saturday view of the slate with live scores and every member's picks colored by whether they are currently winning.
_Avoid_: Scoreboard, dashboard
