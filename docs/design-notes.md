# Saturday Slate — design notes

Visual foundation every screen inherits. Color values come from the Saturday Slate color system (vintage program: flat pine + rust on warm paper). This file is the short version; the long audit with every contrast ratio lives in that system's readme.

## Setup (once)

```bash
npm i tw-animate-css
npx shadcn@latest init            # picks up components.json
npx shadcn@latest add button card badge avatar drawer progress table input
```

`components.json`, `src/app/globals.css` and `src/app/layout.tsx` are already committed. Drawer (Vaul) is used instead of Sheet: it's the bottom-sheet pattern the picks screen needs and it is thumb-reachable.

## Tokens

Use semantic tokens, never hex. Every token has a `-foreground` pair that passes 4.5:1 on it.

| Token | Use it for |
| --- | --- |
| `bg-background` / `text-foreground` | Page and primary text |
| `bg-card` | Game cards, sheets, menus — one step lighter than the page, so no shadows needed |
| `bg-muted` / `text-muted-foreground` | Inactive rows, stripes, secondary text |
| `bg-accent` | Hover / selected surface only |
| `bg-primary` | The chosen team in a pick, publish slate, active nav |
| `bg-secondary` | Lock of the Week, week badges, brand accents |
| `bg-destructive` | Remove member, regenerate magic link |
| `border-border`, `border-input`, `ring-ring` | Rules and focus (pine, 2px) |

Pick and game states (`bg-win text-win-foreground` etc.):

- `win` light moss + dark text · `loss` deep oxblood + cream text. They differ in lightness and text polarity, not just hue, so red-green deficiency never hides a result. Always add the glyph: ✓ / ✕.
- `push` mid clay · `live` the one hot orange (never reuse it) · `locked` clay · `leader` brass (badge only, never behind long text).
- `pending` is a fill token, but **render pending as an outline chip** (`border-border text-foreground`) — its lightness is nearly identical to `win`.

Charts: `chart-1…5` = pine, rust, brass, moss, clay.

## Theme

Light is default (the app is read outdoors). Dark is class-based: add `dark` to `<html>`. Never use Tailwind gray/slate/zinc — every neutral here is warm. No gradients, ever; hover = same color 6% darker, pressed = 12% darker, disabled = `bg-muted text-muted-foreground`.

## Type

- **Chivo** 700/900 (`font-display`, applied to h1–h3): headlines, team names in pick rows, scores.
- **Manrope** 400–800 (`font-sans`): everything else. Tabular numerals are on globally.

| Role | Size / line | Class |
| --- | --- | --- |
| Display | 36 / 40 | `font-display text-4xl leading-10` |
| H1 | 28 / 32 | `h1` |
| H2 | 22 / 28 | `h2` |
| Team / score | 18–28 | `font-display font-black` |
| Body | 16 / 24 | `text-base` |
| Small | 14 / 20 | `text-sm text-muted-foreground` |
| Label | 12 / 16 | `text-xs font-bold uppercase tracking-[0.08em]` (rust for section labels) |

## Spacing and touch

4px scale (Tailwind default). Cards `p-3`, page gutter `px-4`, section gap `gap-3`. **Minimum tap target 44px**: `h-tap` / `size-tap` are defined; the base layer also forces `min-height: 44px` on buttons and inputs so shadcn's 36px defaults never ship. Team rows in a pick are 52px.

## Brand assets

- `public/brand/mark.svg` — the monogram: Chivo Black "S" on pine with a rust rule beneath.
- `public/brand/wordmark.svg` — monogram + SATURDAY SLATE over a rust rule. Needs Chivo loaded; on its own it falls back to Arial Black.
- `src/app/icon.svg` — app icon, the monogram on a pine field, no fine detail. Next serves it as favicon/PWA icon; export 512 and 192 PNGs from it for the manifest.

## Avatars

`public/avatars/pennants/01.svg … 12.svg`, indexed in `avatars.json` (id, name, file, color). One pennant shape, twelve palette colors, twelve flag patterns — so two members never differ by hue alone. Show them at 96px on the first-visit picker, 44px in lists, 28px inline. Store the id on the member; never let a member upload a photo.
