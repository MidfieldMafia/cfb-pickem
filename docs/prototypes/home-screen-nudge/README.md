# Home Screen nudge on Picks (#455): PROTOTYPE

Throwaway. Never merge this branch. It holds the files of the Claude Design canvas
https://claude.ai/artifact/Muraqw87dpHyVDUk63cK6c (private) as a primary source for the #455 build.

The question: how should Picks nudge a member in Safari on iPhone to put Saturday Slate on their
Home Screen, now that the Pick reminder is push only? The #452 answer was a card at the top of Picks,
but on a one-game-per-screen flow every pixel it takes comes out of the team tiles.

| File | Board |
|---|---|
| `Main.dc.html` | First time, A · centred pop-up in the What's new dialog's look |
| `Sheet.dc.html` | First time, B · bottom sheet with a handle, pine bell, Add to Home Screen and Not now. **The winner** |
| `Banner.dc.html` | Every later visit · one bordered row, two lines, an **Add** button and an X. **Kept** |

Tried and dropped on the same canvas: the #452 card with the new copy, and a single 44px line.

Every board is interactive in Play; a dashed prototype button undoes each close. The artboards load
the Saturday Slate Design System from `ds/saturdayslatedesignsystem/`. Those files aren't copied here;
they're in `packages/design-system`.

Verdict (Jonah, 2026-10-23): the bottom sheet (B) the first time, then the banner on every later visit
until the app is on the Home Screen. A new visit is the app opened fresh after 30 minutes away. The
banner's X hides it for the rest of the day. The sheet waits until the Welcome Tour and What's new
are closed. The spec is the comment on #455.
