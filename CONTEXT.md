# Saturday Slate

A private college football pick'em for groups of friends and family. Each week the commissioners post one slate of games that every group plays, members pick straight-up winners on their phones, and the app grades picks from real scores and keeps a season leaderboard for each group.

## Language

### People

**Member**:
A person who plays. A member belongs to one or more groups, and has one Magic Link, one name, one pennant, and one set of picks across all of them.
_Avoid_: User, player, account, participant

**Group**:
A set of members who compete against each other. A group's screens show only its own members, and it has its own Leaderboard; every group plays the same Slate. Anyone can start one.
_Avoid_: League, pool, sub-group

**Organizer**:
A member who runs one group: adds, removes, and reminds its members, promotes members to organizer, and shares its Join Link. An organizer never sees anyone's picks before the Reveal and never touches the Slate or results.
_Avoid_: Admin, owner, group commissioner

**Commissioner**:
A person with power over the whole app: builds the Slate, manages members and groups, corrects picks and results, and holds every Organizer power in every group. A commissioner plays only in the groups they are a member of. Jonah and Alex.
_Avoid_: Admin, owner

**Magic Link**:
A member's permanent personal URL containing a secret token. Opening it signs that member in on that device, in every group they belong to. A commissioner can regenerate it, and so can the organizer of the member's only group; regenerating invalidates the old one.
_Avoid_: Invite link, login link, activation link

**Join Link**:
A group's shareable URL. Opening it adds the person to that group, setting them up first if they are new. An organizer can reset it, which stops the old one working.
_Avoid_: Invite link, group code

**Pennant**:
The mark a member chooses to stand for them on every screen. It is one of three kinds: one of twelve preset flags, their team's logo, or their own photo. Two members may share a flag or a logo; a photo is theirs alone, and a commissioner can clear it, which leaves the member's initial until they pick again.
_Avoid_: Avatar, icon

### Time

**Season**:
One college football year, e.g. 2026. Holds weeks and the season leaderboard. Only one season is active at a time. Starting the next season carries over the Rules and deletes every Group's Chat from the last.

**Week**:
One round of the game inside a season, matching a CollegeFootballData week number. Carries a slate, a deadline, and a weekly result.

**Deadline**:
The instant the week's picks lock. Defaults to the earliest kickoff on the slate; a commissioner may move it earlier, never later. Enforced on the server clock.
_Avoid_: Lock time, cutoff, close

**Reveal**:
The state after the deadline when every member's picks are visible to the rest of their group.

### The game

**Slate**:
The set of about ten games the commissioners choose for a week, played by every group. Published as a whole; members see nothing until it is published.
_Avoid_: Schedule, card, board

**Game**:
One matchup on a slate, backed by a CollegeFootballData game and its live score.
_Avoid_: Match, matchup, fixture

**Tiebreaker Game**:
The one slate game the commissioners flag for the week's tiebreaker.

**Pick**:
A member's choice of the winning team in one game. Saved the moment it is tapped; there is no submit step. One pick counts in every group the member belongs to.
_Avoid_: Prediction, bet, entry, selection

**Lock of the Week**:
The one pick per week a member marks for double points. Optional; at most one per member per week. A Lock on a game that is later voided becomes a Dropped Lock.
_Avoid_: Lock, confidence pick, best bet

**Tiebreaker Guess**:
A member's predicted combined final score of the Tiebreaker Game for the week.

**Void**:
A game that will not count for anyone because it was canceled or postponed after the slate was published. A void game scores zero for everyone and drops any Lock placed on it.

**Dropped Lock**:
A Lock of the Week sitting on a Void game. It stops counting, but it is not destroyed: the member keeps it, the screens tell them why, and restoring the game restores the Lock. Before the Deadline a member may move a dropped Lock to another game; after it, they cannot, and the week goes on without one.
_Avoid_: Lost lock, cleared lock

**Result Override**:
A commissioner's manual correction of a game's final score or void status, taking precedence over the data feed.

### Scoring

**Rules**:
The scoring parameters for a season: points per correct pick, Lock multiplier, and tiebreak order. Rules are inputs to scoring, never baked into stored totals.

**Played Week**:
A week that counts for a member in a group: its Deadline fell while they were in the group, and they made at least one pick. A week that is not played touches nothing — no points, no average, no tiebreak.
_Avoid_: Week participated, week entered

**Weekly Score**:
A member's points for one week, computed from picks, results, and rules on every read; never stored.

**Weekly Win**:
Having the highest Weekly Score in a group for a week. Ties break by Tiebreaker Guess closeness, then are shared.

**Leaderboard**:
A group's season standings: total points, record, weekly wins, average points per Played Week, and average Tiebreaker Guess miss across Played Weeks actually guessed, ordered by the season tiebreak rules. The miss average is display-only, reads lower-is-better, and does not itself decide a tie — the season tiebreak's own closeness figure is a sum over completed Played Weeks, not this average, and the two can rank members differently.
_Avoid_: Standings, rankings, table

**Live Board**:
The Saturday view of the slate with live scores and the picks of every member of a group, colored by whether they are currently winning.
_Avoid_: Scoreboard, dashboard

**Feedback**:
A Member's bug report or idea, sent from the app to the Commissioners: either a Bug or an Idea, in the member's words, with an optional screenshot. Only commissioners read it, and the member hears nothing back beyond the thanks on sending.
_Avoid_: Ticket, request, issue
