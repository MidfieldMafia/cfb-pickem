# Handoff: Saturday Slate app screens

## Overview
Seven screens for the Saturday Slate pick'em (issue #10): Welcome, Install, Pick entry, Review,
Live Board, Week 1 results, Leaderboard, plus a desktop Commissioner console. They define the
intended layout, information hierarchy and interaction for the whole app before functional
screens land in `MidfieldMafia/cfb-pickem`.

## About the design files
Everything in `ui_kits/saturday-slate/` is a **design reference written as browser HTML + Babel-transpiled
JSX**. It is not production code: it loads React from a CDN, imports the design-system bundle
(`_ds_bundle.js`) at runtime, and reads a fixture module instead of the API. The task is to **recreate
these screens in the Next.js app** using its existing `src/components/ui` shadcn components, its
Tailwind theme from `globals.css`, and real data from CollegeFootballData — matching the layouts,
states and copy documented here.

Every component used in the mocks already exists in the repo as a shadcn primitive (Button, Badge,
Card, Input, Progress, Table, Drawer, Avatar), so the mapping should be close to 1:1.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and states are final and come from the design system's
tokens. Recreate pixel-for-pixel with the repo's own components; do not re-style from scratch.
The only deliberately unfinished parts are fixture values (scores, names, forecasts).

## Design tokens
All values are CSS custom properties defined in `styles.css` (the design system) which mirrors the
repo's `globals.css`. Use the token, never the literal hex.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | #F2EADA | app paper |
| `--foreground` | #241F1A | body ink |
| `--card` | #F7F1E3 | cards, tiles, inputs |
| `--primary` | #1E3A2B (pine) | picked state, rank bar, active tab |
| `--primary-foreground` | #F7F1E3 | ink on pine |
| `--secondary` | #B4531F (rust) | Lock, Tiebreaker, section labels |
| `--secondary-foreground` | #FDF6E7 | ink on rust |
| `--muted` / `--muted-foreground` | #E4D9C3 / #6B6154 | quiet fills, secondary text |
| `--border` / `--input` | #9C845F | 1px rules, tile borders |
| `--win` / `--win-foreground` | #6A9449 / #14210C | correct picks, better stat |
| `--loss` / `--loss-foreground` | #5E1F1A / #F7EDE4 | missed picks |
| `--live` | rust family | in-progress badge |
| `--radius-sm/md/lg/xl` | 4 / 8 / 12 / 16px | corners |
| `--spacing-tap` | 44px | minimum hit target |
| `--font-display` | Chivo (900) | scores, team names, numbers |
| `--font-sans` | Public Sans | everything else |

Type scale in use: 28/32 page titles, 22/26 rank + tile team names, 26–28 scores, 17–18 team lines,
14/20 body, 13 secondary, 12 caps labels (`LABEL`: 12px, 700, uppercase, .08em, rust).
Tabular numerals (`font-variant-numeric: tabular-nums`) on every score, record, spread and points value.

## Screens

### 1. Welcome (`WelcomeScreen.jsx`, step 1)
First visit through a Magic Link. No password, no signup.
- Wordmark (36px mark + "SATURDAY SLATE" in Chivo 22 with a 3px rust underline), centered.
- H1 "Welcome to the 2026 season" (Chivo 28/32), subhead explaining the link is theirs.
- Display-name `Input`, labelled "Your name on the Leaderboard", `maxLength=20`, prefilled with the invited name.
- Pennant picker: 4-column grid of 12 buttons, 56px pennant each, min-height 44. Selected = 2px pine border + `--accent` fill. Caption under the grid names the selection.
- Primary "Continue" button, disabled until both a name and a pennant exist.

### 2. Install (`WelcomeScreen.jsx`, step 2)
- Two pill tabs: "iPhone · Safari" / "Android · Chrome" (44px, pine when active).
- Three numbered steps per platform, each a card row: rust Chivo numeral, 36px muted circle with a Lucide icon, 16/22 instruction text. Copy is platform-specific (Share → Add to Home Screen → Add; ⋮ → Install app → Install).
- "Done, start picking" primary + "Skip for now" ghost, then a muted line stating the Week 1 deadline.

### 3. Pick entry (`PicksScreen.jsx` → `PickEntry`)
One game per screen, saved on tap. **Fits 390×740 with no scroll.**
- Header: list icon (opens Review), "Week 1" + "Game 4 of 9 · 3 picked", and a saved-state chip at the right that cycles Pending (dashed) → Saving (spinner) → Saved (green).
- Progress strip: one segment per game, 8px tall, pine when picked, muted when not, current segment ringed. Each segment is a 44px tap target that jumps to that game.
- Meta row: kickoff time · TV network, venue · city beneath; weather pill at the right (fixed 30px, single line: temperature in Chivo 16, condition icon, grey precipitation % only when ≥ 20).
- Matchup panel (flat on the paper, **no card border** so it can't be mistaken for a tap target): Spread row, then four split bars — Points / game, Points allowed, Yards / game, Yards allowed — then Win probability. Each bar: away value left, centered 10px caps label, home value right; the better value bold and the weaker muted (lower is better on the "allowed" rows); the bar itself is 6px, split proportionally, in the two schools' primary colors with a tan gap, falling back to the home school's secondary when the primaries are within 80 in RGB distance.
- Two team tiles side by side, "at" between them, each flexing to fill remaining height (min 124px): rank pill in the inward top corner, logo scaled to fit (`object-fit: contain`), team name Chivo 22 centered, 6px school-color rule, record beneath. Picked = pine fill, cream text, check mark in the outward corner; the other tile dims to 60%.
- Footer: hint text + outlined "Skip for now" ("Review picks" on the last game).

### 4. Review (`PicksScreen.jsx` → `Review`)
- Header with a live deadline countdown (`1d 06h 40m 48s`, updates every second) and a badge counting all required steps ("9 of 11").
- `Progress` bar for picks made.
- **Required-steps checklist** (the fix for people forgetting the Lock and Tiebreaker): three 44px rows — Make every pick, Lock of the Week, Tiebreaker Guess. Incomplete = dashed rust ring + "Set"; complete = green check + "Change". Rows jump to the right place (resume picking, open the Lock drawer, focus the guess field). The card is rust-outlined with "2 things left before the Deadline" until everything is done.
- Picks grouped by kickoff window (Noon / 3:30 / Night) under rust labels; each row shows the pick's logo, "Away at Home" caption, the picked team in Chivo 18, a Lock badge when applicable, and a chevron. Tapping a row returns to that game in Pick entry.
- Lock of the Week selector opens a bottom drawer listing the user's picks; footer has "No Lock this week".
- Tiebreaker Guess: explanatory line + numeric input, rust border until filled.

### 5. Live Board (`LiveScreen.jsx`)
Compact cards, ~100px each, ordered live → scheduled → final → void.
- Sticky rank bar (pine, 60px): 40px pennant, then a two-row grid so both columns share baselines — caps labels "YOU · WEEK 1 SO FAR" / "2–2 SO FAR" on top, "9th of 12" / "20 pts" in Chivo 22 beneath. Rank is computed from the same games the bar summarizes.
- Tabs: "Live Board" / "Week 1 results".
- Each game card is a button (chevron at the right) opening a details drawer:
  - Status row: "Final" / live badge with clock / "Sat 7:30 PM · NBC" / "Postponed" + "Void" badge; a green points pill (+10, +20 for a Lock) appears **only on games the viewer won**.
  - Two team lines: logo 22px, AP rank in small muted numerals between logo and name, name Chivo 17, then the score in Chivo 26 — or, before kickoff, that team's side of the line (favorite in full ink, underdog "+n" muted, "PK" when no favorite).
  - The viewer's pick carries a 20px circled mark: hollow pine check while undecided, filled green check when correct, red cross when missed. On the viewer's Lock game a 17px padlock sits immediately right of the circle, taking the same outcome color.
  - A 4px split bar shows pick distribution across the two sides in school colors. Exact counts are intentionally **not** shown on the card (they read as scores) — they live in the drawer.
- The Tiebreaker game sits inside a rust frame (3px left/right/bottom, taller top) whose header row reads scales icon + "TIEBREAKER" + "Your guess 64" in cream, all on one 16px line.
- Details drawer: matchup title with Tiebreaker/Lock glyphs, score or kickoff + venue, then one panel per side — logo, rank, name, Won/Lost badge (**finals only**; live games get a neutral outlined Leading/Trailing), "7 of 12" count, and a chip per picker (20px pennant + first name, the viewer's chip pine and reading "You", a rust padlock on that member's Lock). On the Tiebreaker game the drawer also lists every member's guess, sorted by number before kickoff and by "off by n" once final.

### 6. Week 1 results (`ResultsScreen.jsx`)
- Rank bar in "Week 1 final" mode.
- Weekly Score list: rank, 28px pennant, name ("you" suffix on the viewer's highlighted row), a "Weekly Win" trophy badge on the winner, record, points. Ordering and the winner both come from the shared scoring helpers, with the tiebreaker as the tie-break.
- Footnote naming the Tiebreaker total, the closest guess, and how a tie was broken. All generated from data.
- Reveal: every game as a card split into two sides — logo, rank, name, score, "n picks" badge, and a 36px pennant per picker ringed by outcome with the viewer's outlined in pine. Void games explain that they score zero for everyone.

### 7. Leaderboard (`LeaderboardScreen.jsx`)
- Table / Cards toggle.
- Table: #, Member (pennant + name, trophy badge on rank 1), Pts (Chivo 18), W–L, Weekly Wins, Avg. The viewer's row is filled `--accent` with a bolder name.
- Cards: rank numeral, 44px pennant, name + role, leader badge, points, then a three-column stat strip (Record, Weekly Wins, Avg / week).
- Footnote states the tie-break rule.

### 8. Commissioner console — desktop (`CommissionerDesktop.jsx`, 1280 wide)
56px top bar (mark, wordmark, "Commissioner console", season badge, the acting commissioner's pennant) + 220px left nav with four sections:
- **Slate builder**: candidate table from CFBD (checkbox, matchup with both logos, kickoff, TV, spread) with a team search; sticky right rail holding the 10-game slate, a Tiebreaker Game radio per row, remove buttons, a deadline field defaulting to the earliest kickoff, and Publish (disabled until exactly 10 games and a Tiebreaker are set).
- **Members**: add-member row (name, phone, "Create Magic Link"), then a table of members with role badges, masked magic links + copy, last-opened, and Regenerate — which expands an inline destructive confirm explaining it signs that member out everywhere.
- **Who hasn't picked**: per-member pick progress (a 10-segment strip + "9 of 9"), Lock badge or "Not set", Tiebreaker Guess, and a "Text a nudge" action; right rail shows the deadline countdown and a Ready count.
- **Result overrides**: per-game score inputs (edit → Save as Final), Void / Restore, and status badges. Copy states that scores come from CFBD and overrides are for feed errors or unplayed games.
A phone version of the same console exists in `CommissionerScreen.jsx` for the app's fourth tab.

## Interactions & behavior
- **Pick entry**: tapping a team writes the pick, shows Saving for ~350ms, then Saved, then advances (or goes to Review after the last game). No submit step. Skipping leaves the segment muted.
- **Review**: countdown ticks every second. Checklist rows are shortcuts, not separate screens. The Lock drawer is single-select and clearable.
- **Live Board**: card tap opens the drawer; the drawer is portalled outside the scrolling screen (`#sheet`) so it pins to the frame bottom, and its body scrolls with `max-height: calc(100dvh - 240px)` on short phones.
- **Reveal rule**: the mocks assume the Deadline has passed and everyone's picks are visible. Before the Deadline the product should show counts only.
- **Void games**: score zero for everyone and drop any Lock placed on them; cards render at 70% opacity with a "Void" badge.
- Every interactive element is at least 44px; hit targets in dense rows are padded, not shrunk.

## State
Per screen: current game index, picks map, lock id, tiebreaker guess string, saving/flash flags (Pick entry + Review); open game id (Live Board); table/cards view (Leaderboard); section, slate selection, tiebreaker id, deadline, published flag, editing row (Commissioner). All screen-level React state in the mocks; in the app these map to server state plus optimistic writes on pick tap.

## Scoring rules the screens assume
10 points per correct pick, 20 for the Lock, nothing for a miss. Only games with a result count. Voided games score zero for everyone. Weekly Win goes to the highest weekly score, tie-broken by closeness of the Tiebreaker Guess. Season standings are derived from the same helper, never hand-written — see `data.jsx` (`weekScore`, `TB_TOTAL`, `tbDelta`, `WEEKLY_WINNER`, `LEADERBOARD`).

## Data the screens need
Beyond `/games`:
| Field | CFBD endpoint |
| --- | --- |
| AP rank | `/rankings` |
| Record | `/records` |
| Points and yards for / against | `/stats/season` + `/games` |
| TV network | `/games/media` |
| Pregame win probability | `/metrics/wp/pregame` |
| Venue, city | `/games`, `/venues` |
| Forecast (temp, precip %, wind) | `/games/weather` — **paid tier**; the weather pill is the only thing that needs it |

## Assets
- `assets/logos/<slug>.png` — 150px school marks for 136 FBS schools (source: github.com/klunn91/team-logos). Ship to `public/logos/`.
- `assets/logos/espn/<espnId>.png` — 32px marks keyed by ESPN team id (source: github.com/CFBD/cfb-web), so a logo resolves straight from the CFBD `team.id`. Ship to `public/logos/espn/`.
- `assets/logos/logos.json` — school → slug → ESPN id → `{primary, secondary, source}` colors for the 31 Week 1 schools. Ship to `src/lib/logos.json`. 7 color pairs are verified from teamcolorcodes.com; the other 24 come from school brand guides and are flagged `brand guide (unverified)`.
- `assets/avatars/pennants/01–12.svg` + `avatars.json` — member avatars, already in the repo at `public/avatars/pennants/`.
- `assets/brand/mark.svg` — app mark.
- Icons are Lucide, already a repo dependency.

## Files in this bundle
The design sources live under `source/` with a `.txt` suffix so this reference copy is not compiled
as part of the design system; strip the suffix to run them. The live, editable originals are in
`ui_kits/saturday-slate/`.

| File | What it holds |
| --- | --- |
| `index.html` | phone shell, tab nav, deep links (`?tab=welcome|install|picks|live|results|leaderboard|commish`, `&view=review`, `&theme=dark`) |
| `commissioner.html` | desktop console shell (`?section=slate|members|picks|results`) |
| `Shell.jsx` | AppHeader, BottomNav, SectionLabel, MemberRow, Sheet portal, `LABEL`/`DISPLAY` type styles |
| `data.jsx` | fixture data + scoring helpers, commented with the CFBD endpoint each field maps to |
| `WelcomeScreen.jsx` | Welcome + Install |
| `PicksScreen.jsx` | Pick entry + Review |
| `LiveScreen.jsx` | Live Board, rank bar, details drawer |
| `ResultsScreen.jsx` | Week results + Reveal |
| `LeaderboardScreen.jsx` | Leaderboard |
| `CommissionerScreen.jsx` / `CommissionerDesktop.jsx` | console, phone and desktop |
| `styles.css` | the design system's tokens and `@font-face` rules, for reference against `globals.css` |
| `logos.json` | logo + color index (copy of `assets/logos/logos.json`) |

To view the mocks locally, serve the repo root and open `ui_kits/saturday-slate/index.html` — the pages
expect `styles.css` and `_ds_bundle.js` two directories up, plus `assets/`.
