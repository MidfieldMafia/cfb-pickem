# Saturday Slate conventions

Saturday Slate is a phone-first college football pick'em: flat pine and rust on warm paper. Design at 390px wide, single column, light theme only.

## Setup

- Link `styles.css` once, load React, then `_ds_bundle.js`. No provider or wrapper is needed; every component reads plain CSS custom properties.
- Fonts (Chivo for display, Manrope for text) load from Google Fonts inside `styles.css`. Do not add your own `@font-face`.
- Compose from `window.SaturdaySlateDesignSystem.*`. Never rebuild a Button, Badge, Card, Table or Pennant by hand.
- Icons are Lucide (`lucide-react` in the app). 16px by default, 12px inside badges, 20px for a header icon.

## Styling idiom: tokens first, no invented classes

The stylesheet is a compiled Tailwind 4 build that contains only the utility classes the library's own components use. A class the components never use does not exist, so do not write Tailwind utilities for your own layout.

- For your own glue, use inline styles or your own CSS with the `var(--*)` tokens below.
- Classes that do exist and are safe: `font-display` (Chivo 900, for headings, team names, scores), `tabular-nums`, `text-muted-foreground`, `text-secondary`, `bg-card`, `bg-muted`, `bg-accent`, `border-border`, `rounded-xl`, `text-foreground`. Anything else, check `_ds_bundle.css` first.
- Colour tokens, all warm and paired with a `-foreground`: `--background` (paper), `--card` (one step lighter than paper; cards never need a shadow), `--foreground` (ink), `--primary` (pine: chosen team, main action, active nav), `--secondary` (rust: Lock of the Week, caps section labels), `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border` (tan), `--ring`.
- Game-state tokens: `--win`, `--loss`, `--live`, `--locked`, `--pending`, `--leader`, `--settled`, `--settled-border`, `--loss-border`. Show a state with `Badge variant="win|loss|live|locked|pending|void|leader"`, never a hand-coloured chip; `win` and `loss` carry their own check and cross.
- Radius by surface: `--radius-xl` (14px) for a phone card, `--radius-md` (6px) for a console panel or inner row, full-round only for badges, pennants and pills. Never mix the two at the same level.
- Type: `--font-display` for headings and scores, `--font-sans` for everything else. Scale: h1 28/32, h2 22/28, body 16/24, small 14/20, caps label 12/16 bold uppercase with 0.08em tracking in `--secondary`. Numbers are tabular.
- Spacing: 4px steps. Card padding 12px, page gutter 16px, gap between sections 12px. Taps are at least 44px (`--spacing-tap`); rows with a logo or a badge are 56px.
- No gradients, no shadows on cards, no emoji, no photos. Sentence case, except the caps labels.

## Where the truth lives

Read `styles.css` and `_ds_bundle.css` for the real tokens and classes. For a component, read `components/general/<Name>/<Name>.prompt.md` and `<Name>.d.ts` before using it.

## Images

School logos and pennants are files the caller supplies: `TeamLogo` takes a `src`, `Pennant` takes `avatar={{ name, file, color }}` (or `undefined` for the initial fallback). Only the brand mark inside `Wordmark` and `AppHeader` is built in. Team name plus rank is `TeamName name rank`, and `rank` is required (pass `null` when unranked).

## A card built from the library

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter,
        Badge, Button, TeamName } = window.SaturdaySlateDesignSystem;

<Card>
  <CardHeader>
    <CardTitle>Georgia at Alabama</CardTitle>
    <CardDescription>Sat, 3:30 PM · Bryant-Denny Stadium</CardDescription>
    <CardAction><Badge variant="locked">Locked</Badge></CardAction>
  </CardHeader>
  <CardContent>
    <TeamName name="Georgia" rank={2} className="text-lg" />
  </CardContent>
  <CardFooter><Button size="sm" variant="outline">Change pick</Button></CardFooter>
</Card>
```
