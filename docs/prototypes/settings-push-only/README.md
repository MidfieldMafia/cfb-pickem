# Settings, push-only Pick reminder (#454): PROTOTYPE

Throwaway. Never merge this branch. It holds the files of the Claude Design canvas
https://claude.ai/artifact/DuNb5it8YN4r8CD6G9mzcp (private) as a primary source for the #454 build.

The question: with texting paused (PR #468), how small and quiet can the Settings card be once
the Pick reminder is only push, on or off? It replaces the Push / Text / Off control approved on #452.

| File | Board |
|---|---|
| `Main.dc.html` | A · "Pick reminder" row in a card, one help line that a problem replaces |
| `OneLine.dc.html` | B · One row, "Remind me before picks lock", with a footnote only when something blocks push. **The winner** |
| `MenuSwitch.dc.html` | C · No Settings page: the switch is a row in the member menu |
| `Before.dc.html` | The #452 design A, copied unchanged, for comparison |

Every board is interactive, with a scenario picker: Home Screen app (off, on), Safari on iPhone,
a computer, notifications blocked, and push that stopped reaching the phone.

The artboards load the Saturday Slate Design System from `ds/saturdayslatedesignsystem/`. Those files
aren't copied here; they're in `packages/design-system`.

Verdict (Jonah, 2026-10-23): board B exactly as drawn, with no section heading above the row (the
heading tried on A is not part of it). The spec is the comment on #454.
