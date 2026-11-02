# Settings, a row for each new push (#494): PROTOTYPE

Throwaway. Never merge this branch. It holds the files of the Design canvas
https://claude.ai/artifact/9oZVG7xjST2WcCXbnXik1z (private) as a primary source for the v5 push builds.

The question: how does Settings let a member choose each v5 push (Chat All / @mentions / Off, Weekly Win,
Close games, New Feedback for commissioners) beside the existing Pick reminder switch, and what does each
row show when push can't reach this phone? The rules for the rows are on #493 (comment 6584551601).

| File | Board |
|---|---|
| `Main.dc.html` | A · One card. Every row in one card, with switches showing what reaches this phone. Chat is a three-way segmented control. A device problem is one footnote under the card |
| `Cards.dc.html` | B · A card per push. The shipped one-line row repeated, with Chat as a native Select. A Turn on notifications card gates the rows, which are greyed until a device is saved |
| `Choices.dc.html` | C · This phone apart from your choices. A This iPhone status card, then checkboxes and Chat radios that save anywhere, a computer included |

Every board is interactive, with a scenario picker: a new member in the Home Screen app, the reminder
already on, Safari on iPhone, a computer, notifications blocked, and push that stopped reaching the phone.
A Commissioner tick shows the New Feedback row.

The artboards load the Saturday Slate Design System from `ds/saturdayslatedesignsystem/`. Those files
aren't copied here; they're in `packages/design-system`.

Verdict: pending Jonah.
