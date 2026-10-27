# Prototype: where the max possible Weekly Score shows (#488)

Throwaway. Never merge. The canvas source behind
https://claude.ai/artifact/YYDBmy1UG8543XhdWbk2Hy, kept as a primary source for #480.
The design system copy (`project/ds/`) is left out: it comes from the
"Saturday Slate Design System" Artifact, version 1792811404-d4d4.

The question: where and how should a member's max possible Weekly Score show
while a Week is in play, now that PR #487's extra line under the card's figure
and the max stacked under the Week list's points were both turned down?

Boards, all at 390px, with Week 8 in progress (5 final, 1 live, 2 to kick off).
A dashed button on each one switches the Week to complete:

- `Main.dc.html`, A: the Leaderboard's Week list gains a Max column right of
  the points. Tweaks: header row (`W–L · Pts · Max`) on or off, the max's look,
  and what a member who sat out shows (`–`, `0`, blank).
- `CList.dc.html`, C: the points read `40/80`, with `/80` small and muted.
- `ALive.dc.html`, A alone: the Live Board card exactly as on main, no max.
- `BLive.dc.html`, B: the max goes in the card's caps detail line. Tweak: the
  copy (`4–1 · max 80`, `4–1 so far · max 80`, `max 80`).
- `CLive.dc.html`, C: the card's figure reads `40/80`. This needs
  `StandingCard`'s `figure` to take a node, not a string.

None of these makes the YourRank card taller than on main.

Verdict: pending.
