# Jev routing: hindsight grades

Every agent:go build, graded by the level it needed in hindsight, beside what Jev's
answers routed it to. The questions, the combining rule and the tier table are in
`.claude/skills/agent-go/SKILL.md` ("Jev's question"); the thresholds are in
`src/lib/agent-go/route.ts`. Retune them from this table, never from fewer than ten
rows built since the last retune, and only once a build has run on a Sonnet tier
(#549).

## How a row is graded

From the ticket and the merged diff, answer the three questions by hand: **Risk?**
yes or no; **Open** and **Reach** counted 0 to 2. **Needed** is `open + reach + 1`,
raised to at least 4 by a yes on risk. **Code** excludes Drizzle snapshots, images
and the lockfile. **Outcome** is the build's minutes claim→PR, and whether it
escalated, drew a review finding, or needed a later fix or revert on `main`.

## Before #548: the old five-level Score (graded 2026-11-06, on #548)

"Jev said" is the old rubric's level and confidence.

| PR | Ticket | Code, files | Risk? | Open | Reach | Needed | Jev said | Built on | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| #483 | #481 third X hides the banner | +52, 2 | no | 0 | 0 | **1** | L5 @ 0 | Opus med | 11 min, fine |
| #490 | #489 nudge tracking | +73, 4 | no | 0 | 0 | **1** | error | Sonnet med | 6 min, fine |
| #544 | #514 pennant menu on Picks | +81, 8 | no | 0 | 1 | **2** | L2 @ 0.57 | Opus med | 12 min, fine |
| #469 | #456 app icon outline | +96, 8 | no | 1 | 0 | **2** | L5 @ 0 | Opus med | 27 min, fine |
| #518 | #516 Jev confidence 0 | +317, 6 | no | 0 | 1 | **2** | L3 @ 0.46 | Opus med | 11 min, fine |
| #520 | #517 push gate heredocs | +440, 3 | no | 1 | 0 | **2** | L3 @ 0.33 | Opus med | 19 min, fine |
| #471 | #455 Home Screen nudge | +408, 5 | no | 1 | 1 | **3** | L5 @ 0.65 | Opus med | 52 min\*, fine |
| #486 | #482 reminders-on sheet + banner | +601, 9 | no | 1 | 1 | **3** | error | Sonnet med | 27 min, fine |
| #542 | #533 Feedback push | +293, 7 | yes | 0 | 1 | **4** | L5 @ 0.35 | Opus med | 12 min, fine |
| #541 | #532 Weekly Win push | +379, 7 | yes | 0 | 1 | **4** | L5 @ 0.5 | Opus med | 14 min, fine |
| #487 | #480 max Weekly Score | +276, 11 | yes (scoring) | 1 | 1 | **4** | L4 @ 0.7 | Opus med | 14 min; display reworked after the #488 prototype, not a build fault |
| #540 | #531 Close game push | +521, 21 | yes | 1 | 2 | **4** | L5 @ 0.39 | Opus med | fine (1219 min includes a paused run) |
| #478 | #475 remove Text channel | +229, 14, migration | yes | 0 | 2 | **4** | L5 @ 0.46 | Opus med | 26 min, fine |
| #547 | #546 heartbeat follows the slate | +752, 15 | yes (production schedules, secrets) | 0 | 2 | **4** | L5 @ 0.12 | Opus med | 16 min, fine |
| #539 | #530 Chat pushes | +569, 15, migration | yes | 1 | 2 | **4–5** | L5 @ 0.44 | Opus med | 16 min, fine |
| #470 | #454 Settings + push reminder | +1253, 36, migration | yes | 2 | 2 | **5** | L5 @ 0.68 | Opus med | 42 min\*, 137 tool calls |
| #535 | #529 per-push switches | +1010, 31, migration | yes | 1 | 2 | **5** | L5 @ 0.74 | Opus high | 25 min, fine |

\* Before #477's speed fixes.

## After #548: the three questions (graded 2026-11-20, #549)

"Jev's answers" is the `risk` Noul, then each Score's `score` at its confidence, and
the counted value in brackets. "Rule" is the route's `reason`, and "Base" the level
`open + reach + 1` gave before it moved. Every one of these ran on Opus medium,
none escalated, and none drew a human review comment or a later fix or revert on
`main` up to `d7ce2e8`.

| PR | Ticket | Code, files | Jev's answers | Base | Rule → level | Risk? | Open | Reach | Needed | Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| #557 | #506 README and social preview | +34, 1 (docs) | risk 0.04, open 1.58 @ 0.38 [2], reach 0.01 @ 1 [0] | 3 | low confidence → 4 | no | 1 | 0 | **2** | 10 min; one Standards finding (a GLOSSARY _Avoid_ word), fixed |
| #567 | #562 the try clears the touchdown's drawing | +72, 3 | risk 0.07, open 0.62 @ 0.4 [1], reach 1.66 @ 0.49 [2] | 4 | base → 4 | no | 0 | 0 | **1** | 10 min, fine; review not recorded |
| #568 | #563 a failed two-point try ends at an X | +104, 2 | risk 0.17, open 1.1 @ 0.64 [1], reach 0.42 @ 0.37 [0] | 2 | low confidence → 4 | no | 1 | 0 | **2** | 19 min, 62 tool calls; review found nothing |
| #573 | #569 Dependabot backlog, Next 16.4.6 | +12, 1 (lockfile) | risk 0.12, open 1.24 @ 0.43 [1], reach 1.53 @ 0.3 [2] | 4 | base → 4 | no | 1 | 1 | **3** | 9 min, fine; review not recorded |
| #574 | #564 a missed kick's X shows whole | +37, 2 | risk 0.08, open 0.4 @ 0.4 [0], reach 0.1 @ 0.85 [0] | 1 | low confidence → 4 | no | 0 | 0 | **1** | 8 min; one finding (a wrong comment), fixed |
| #577 | #566 a failed heartbeat refresh logs | +102, 5 | risk 0.51, open 1.47 @ 0.24 [1], reach 1.73 @ 0.58 [2] | 4 | base → 4 | no (borderline: the live heartbeat's error path, no schedule or secret) | 1 | 1 | **3** | 10 min, fine; review not recorded |
| #549 | #549 retune Jev's questions (this one) | docs only | risk 0.82, open 1.43 @ 0.15 [1], reach 1.02 @ 0 [1] | 3 | risk → 4 | no | 2 | 0 | **3** | in progress |

## What the post-#548 rows show (#549)

Six finished builds and this one, all on Opus medium: fewer than ten, and none on a
Sonnet tier, so by #549's own bar **the questions, the rule and the thresholds
stand**. These are the readings to test at the next retune, with the rows behind
each:

- **Nothing under-powered, most over-powered.** Needed levels were 1, 1, 2, 2, 3 and
  3 (#567, #574, #557, #568, #573, #577); every one ran at level 4. As before #548,
  the data can show over-powering but not where a cheaper tier would fail.
- **Confidence never clears 0.6 on both Scores.** 3 of the 12 Score confidences
  reach 0.6 (#568 `open`, #557 and #574 `reach`), and no ticket has both. So the
  down-shift never fires, and the three builds whose base was right or close (#574
  base 1, #568 base 2, #557 base 3) went to 4 by low confidence. While this holds,
  no build reaches a Sonnet tier, so #549's "none on a Sonnet tier" stop can never
  lift by waiting: a decision for Jonah, either to move `MOVE_DOWN_CONFIDENCE` or
  reword the Score levels that split, or to route some builds to Sonnet on purpose.
- **`reach` reads a `src/lib` module as shared logic.** All three level-4s by base
  (#567, #573, #577) got there through `reach` rounding to 2 on changes graded 0 or
  1: #567's `field-player.ts` draws only the Game sheet's field. Level 3's "shared
  logic that several screens rely on" is the likely wording to tighten.
- **`risk` missed nothing**, since no post-#548 build was graded risky; #577's 0.51
  stayed below 0.7 on a change graded borderline. One false positive: #549 itself at
  0.82, plausibly because the ticket asks to "grade" builds and the Noul names
  "grading or scoring". If it recurs, say "grading members' picks".
