# Settings, Notifications card and Home Screen nudge (#452): PROTOTYPE

Throwaway. Never merge this branch. It holds the files of the Claude Design canvas
https://claude.ai/artifact/Lf36GiQZFt4MDNxJkZLRRL (private) as a primary source for the build ticket.

The decision these boards draw is on "Should Saturday Slate send push notifications?" (#339).
The boards were sized from "Count the members who use the Home Screen app" (#451): 17 of 24 active
members use the Home Screen app, 6 use Safari on iPhone, 1 is desktop-only, and none is on Android.

| File | Board |
|---|---|
| `Main.dc.html` | A · A segmented Push / Text / Off control. Interactive, with a scenario picker and the iPhone permission prompt |
| `Rows.dc.html` | B · One radio row per channel, each unavailable channel's reason in its row. Same scenarios |
| `Menu.dc.html` | The member menu with Settings between What's new and Send feedback |
| `NudgeCard.dc.html` | Re-nudge 1 · a card on Picks, in Safari on iPhone only, with Not now |
| `NudgeText.dc.html` | Re-nudge 2 · the reminder text links to /install for members who have never opened the Home Screen app |
| `Push.dc.html` | The push: two title/body splits and where a tap lands |

The artboards load the Saturday Slate Design System from `ds/saturdayslatedesignsystem/`. Those files
aren't copied here; they're in `packages/design-system`.

Verdict (2026-10-21): design A, both re-nudges, push wording 1, Text that can't be delivered stays selected and shows as paused, no test button. The spec is the resolution comment on #452.
