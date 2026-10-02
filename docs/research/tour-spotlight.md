# Build or borrow the Tour spotlight

Research date: 2026-10-01. Resolves [#367](https://github.com/MidfieldMafia/cfb-pickem/issues/367),
a sub-issue of the [Tours](https://github.com/MidfieldMafia/cfb-pickem/issues/366) map. Feeds the
prototype ticket "How a Stop looks and moves".

**Question.** Should the Tour spotlight (a Stop dims the screen, spotlights one thing, explains it in
a short text box with Next) come from a library or be built by hand, on this stack?

**Sources.** The npm registry (`npm view`, 2026-10-01); the library source at the published
versions, cloned from GitHub (driver.js `nilbuild/driver.js@010fb13`, 2026-07-18, = 1.8.0;
react-joyride `gilbarbara/react-joyride@1fe55f1`, 2026-07-09, = 3.2.0); the installed dist of every
candidate; driver.js's own docs (`apps/docs/src/content/guides/*.mdx` in that repo, published at
driverjs.com); MDN; the Next.js 16.3.4 docs bundled at `node_modules/next/dist/docs/`; the installed
`vaul` and `@radix-ui/*` packages; and this repo at `396b49d`. Bundle sizes are measured, not quoted:
each package's entry bundled with `esbuild --bundle --minify --format=esm`, with react, react-dom,
next and motion external, then `gzip -9`.

## Answer

**Build it by hand, as a native `<dialog>` opened with `showModal()`.** driver.js is the only
library worth borrowing and the runner-up, but on this app it would sit *underneath* the What's new
`<dialog>` and give a focus trap that VoiceOver can walk straight out of. A modal `<dialog>` is the
only overlay that stacks above everything here without a z-index arms race, and it gives the
focus containment, inert background and Escape handling for free. The parts a library would
actually save us (measure a rect, cut a hole, wait for an element) come to roughly a hundred lines.

The reasoning, criterion by criterion, follows.

## The candidates

| Package | Version, last publish | Licence | React 19 | Measured size (min+gz) | Verdict |
|---|---|---|---|---|---|
| driver.js | 1.8.0, 2026-07-17 | MIT | framework-free, no peers, zero deps | **7.3 kB** JS + 1.0 kB CSS | Runner-up |
| react-joyride | 3.2.0, 2026-07-09 | MIT | peer `react 16.8 - 19`; dist starts `'use client'` | 27.3 kB | Viable, heavier |
| shepherd.js / react-shepherd | 15.3.0 / 7.0.6, 2026-08-24 | **AGPL-3.0** (or commercial) | peer `^18 \|\| ^19` | 16.1 kB + 1.0 kB CSS | Out: licence |
| intro.js | 8.6.0, 2026-09-21 | **AGPL-3.0** (or commercial) | framework-free | 20.3 kB + 2.0 kB CSS | Out: licence |
| @reactour/tour | 3.8.0, **2025-05-07** | MIT | peer `16–19` | 9.6 kB | Out: no release in 17 months |
| nextstepjs | 2.3.0, 2026-07-20 | MIT | peers `next >=13`, `react >=18`, **`motion >=11`** | 5.8 kB + motion ≈ **47.7 kB** | Out: pulls in motion |
| onborda | 1.2.5, **2024-12-22** | MIT | peers `framer-motion`, `@radix-ui/react-portal` | — | Out: abandoned |
| Hand-rolled `<dialog>` | — | — | — | est. 2–4 kB of our own code | **Recommended** |

Licences, versions, dates and peers are from `npm view <pkg> version license time.modified
peerDependencies`. Shepherd and intro.js are AGPL for any use that isn't bought out, which a
closed-source app served over a network can't meet without a commercial licence; they are not
evaluated further. Nothing current beats driver.js or react-joyride on this stack: nextstepjs is
the only newer, Next-aware option, and its `motion` peer alone is six times driver.js.

## Criterion 1 — Next.js 16 App Router and React 19

- **driver.js** is plain DOM: `driver()` appends its own SVG and popover to `document.body`
  (`overlay.ts` `mountOverlay`, `popover.ts:97`). It has no React peer at all, so React 19 is not a
  question; it must be created inside a client component's effect. Maintained: 1.7.0 and 1.8.0 both
  landed in 2026 (changelog in `apps/docs/src/content/guides/changelog.mdx`), 26.9k stars, 25 open
  issues on 2026-10-01.
- **react-joyride** declares `react`/`react-dom` `16.8 - 19` and its published `dist/index.mjs`
  begins with `'use client'`, so it can be imported from a server component's tree. Maintained
  (3.2.0, July 2026).
- **Hand-rolled** is a client component like `src/components/whats-new.tsx` already is.

Either library *mutates React-owned DOM*: driver.js adds classes (`driver-active-element`,
`driver-active-element-parent`) and `aria-haspopup`/`aria-expanded`/`aria-controls` to the target
and its parent (`highlight.ts:140-185`). React only rewrites `className` when the prop changes, so
this usually survives, but a re-render that changes the target's classes (an `active` tab, a live
row ticking) will drop driver's highlight class mid-Stop. A hand-rolled overlay only *reads* the
target's rect and never writes to it.

## Criterion 2 — iOS Home Screen PWA

What the app is: `display: "standalone"` (`src/app/manifest.ts`), `viewportFit: "cover"`, the body
padded by the top/left/right safe-area insets and a `fixed z-20` strip over the top inset
(`src/app/layout.tsx`), pinch-zoom left enabled, and the document itself as the scroller on member
screens — except `chat-thread.tsx:248`, `review.tsx:375`, `game-sheet.tsx:681` and the reaction
list, which scroll inner `overflow-y-auto` boxes.

In standalone mode there is no Safari toolbar, so `100dvh`, `100svh` and `100lvh` agree and the
"dynamic toolbar" problem mostly disappears. What remains is safe areas, pinch-zoom (the reason the
bottom nav is fixed to the visual viewport, #99), inner scrollers and the element moving under the
spotlight.

**driver.js**
- Overlay is a `position: fixed; width/height: 100%` SVG whose `viewBox` is
  `window.innerWidth × window.innerHeight` (`overlay.ts:110-135`). It never reads `visualViewport`,
  so under pinch-zoom the cutout is computed in layout-viewport coordinates. Safe areas are not
  considered; the popover can land under the home indicator unless styled around it.
- Tracking: only `window` `resize` and `scroll`, both without `capture` (`events.ts:97-101`). A
  `scroll` on an inner element does not bubble to `window`, so a Stop inside the chat thread or the
  game sheet's stats list would not follow. There is no `ResizeObserver`; a target that moves
  because data loaded above it stays mis-spotlit until the next window scroll/resize or a manual
  `driverObj.refresh()` (`driver.ts:381`).
- Scroll lock: `allowScroll: false` adds `overflow: hidden` to `body` (`driver.css:10`) and to a
  scrollable direct parent (`driver.css:44`). On this app the document root is `html`/`body`, so
  this is the usual iOS-dependent body lock; it should be checked on a device whichever option wins.
- Scroll into view: `scrollIntoView({block: "center"})` when the target is outside
  `window.innerHeight` (`utils.ts:45-58`), which ignores the fixed bottom nav, so a "centred" target
  near the bottom can still sit under it.

**react-joyride**
- Better tracking: `window` scroll and resize, a scroll listener on the target's scroll parent, and
  a `ResizeObserver` on the target (`hooks/useTargetPosition.ts:83-100`), debounced by 100 ms. The
  tooltip is positioned by Floating UI's `autoUpdate`, which includes `visualViewport` among the
  ancestors it listens to.
- The overlay is `position: absolute` over the whole document height (`styles.ts:44-52`,
  `Overlay.tsx`), and the cutout is hidden while scrolling (`showCutout = … && !scrolling`). There
  is no scroll-lock option.

**Hand-rolled.** A modal `<dialog>` is in the top layer and is positioned against the viewport,
so the cutout is one `getBoundingClientRect()` of the target drawn into an SVG mask (or a
`box-shadow: 0 0 0 100vmax` box) inside it. Tracking is ours to decide: `ResizeObserver` on the
target, `scroll` on `window` with `{capture: true}` (catches inner scrollers), and
`visualViewport` `resize`/`scroll`, rAF-throttled. Safe areas are ordinary
`env(safe-area-inset-*)` padding in our own CSS. Scroll lock is the same `overflow: hidden` on
`html` that every option needs; a modal dialog makes the page inert but does not by itself stop it
scrolling.

## Criterion 3 — stacking against the bottom nav, Vaul sheets and native `<dialog>`

The layers in this app today: bottom nav `fixed … z-10`; safe-area strip `z-20`; Vaul overlay and
content, the photo crop and the launch screen `z-50`; and the What's new modal, a native `<dialog>`
opened with `showModal()` (`src/components/whats-new.tsx:58`).

- A modal dialog is in the **top layer**, above every z-index in the document, and "elements inside
  the same document as the dialog, except the dialog and its descendants, become inert"
  ([MDN, `showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal),
  [MDN, Top layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer)). Top-layer elements
  paint in the order they entered it, last on top
  ([CSS Positioned Layout 4, §top layer](https://drafts.csswg.org/css-position-4/#top-layer)).
- **driver.js** appends to `body` with `z-index: 10000` (overlay, `overlay.ts:126`) and
  `1000000000` (popover, `popover.css:26`). That clears the nav, the strip and every `z-50`, but it
  cannot clear an open modal `<dialog>`: it renders beneath it and, being outside it, is inert. Its
  SVG overlay can't be promoted either — the `popover` attribute is an HTML attribute, and driver
  creates the SVG internally.
- **react-joyride** portals into `#react-joyride-portal` on `body` at `zIndex: 100` by default — the
  same problem — but it takes a `portalElement` prop (`types/props.ts:50`), so it *could* be portalled
  into a top-layer container we open ourselves. At that point we are building the dialog anyway.
- **Hand-rolled** with `showModal()` stacks above the nav, the sheets and the What's new dialog,
  because it is opened after them.

Two rules hold whichever option is chosen:

1. **Don't run a Stop over an open Vaul sheet.** Vaul is a Radix Dialog (`vaul` depends on
   `@radix-ui/react-dialog`). While a modal sheet is open Radix sets `body.style.pointerEvents =
   "none"` (`react-dismissable-layer` `index.mjs:113`), which the Tour's buttons inherit; treats any
   `pointerdown` outside its content as a dismissal (`:293`); and its focus scope fights for focus
   (`react-focus-scope` `:65`). A Tour that needs a sheet's contents should open the sheet as the
   *spotlight target*, not underneath a library popover — a question for the spec's "target not on
   screen" fog.
2. **The Welcome/What's new Tour replaces the What's new dialog** (the map says so), so in practice
   the two never coexist; the top-layer answer just means nothing breaks if they briefly do.

## Criterion 4 — a Tour that crosses routes

- Next.js keeps layouts mounted across client navigation: "On navigation, layouts preserve state,
  remain interactive, and do not rerender"
  (`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43`). So a Tour
  component mounted in `src/app/(member)/layout.tsx` (where `<WhatsNew>` lives now) survives a
  `router.push`, whichever option drives the overlay.
- **driver.js** has `waitForElement` (ms, driver- or step-level, default 0): it re-resolves the step's
  element on every DOM mutation with a `MutationObserver` on `documentElement` (`childList`,
  `subtree`, `attributes`) and falls through to the missing-element handling on timeout
  (`driver.ts:244-292`). Driver's own docs recommend, for multi-page tours, destroying the tour
  before navigating and starting a fresh one at the saved step on the next page, with
  `waitForElement` on that first step "after a client-side route change"
  (`apps/docs/src/content/guides/multi-page-tour.mdx`). While it waits, the *previous* step stays
  highlighted (comment at `driver.ts:283`) — after a route change that previous target has been
  unmounted, so unless the tour was destroyed first, the cutout and popover point at a node that is
  gone. `skipMissingElement` (1.7.0) skips a step whose target never shows.
- **react-joyride** waits with `targetWaitTimeout` (default 1000 ms), polling `getElement` every
  100 ms until the target exists *and* is visible (`hooks/useLifecycleEffect.ts:205-235`). It is
  React-controlled (`run`, `stepIndex`), so the step can be advanced by our own state after
  `router.push`.
- **Hand-rolled** gets the same mechanism in a few lines: `router.push(stop.href)`, then await a
  `MutationObserver` (or `requestAnimationFrame` poll) for the target selector with a timeout, and
  only then show the Stop. Because the Tour owns the overlay, it can hold a plain dimmed screen with
  no cutout while it waits instead of a stale one.

## Criterion 5 — accessibility

| | driver.js 1.8.0 | react-joyride 3.2.0 | Hand-rolled modal `<dialog>` |
|---|---|---|---|
| Role | `role="dialog"`, `aria-labelledby`/`-describedby` on the popover (`popover.ts:162-164`) | `role="alertdialog"`, `aria-modal: true` (`Tooltip/index.tsx:123-125`) | native dialog semantics; modal by construction |
| Focus trap | JS: intercepts `Tab` on `keydown` and cycles between the popover and the target (`events.ts:17-50`) | JS: intercepts `Tab` inside the tooltip (`hooks/useFocusTrap.ts`) | the rest of the document is **inert** |
| Screen-reader escape route | open: no `aria-modal`, no `inert`; VoiceOver swipe navigation ignores `Tab` traps and `pointer-events`, so it can leave the popover | `aria-modal` asks AT to stay; page is not inert | none — inert content is out of the accessibility tree |
| Escape | `keyup` → `escapePress` → close (`events.ts:59`), unless `allowKeyboardControl: false` | `dismissKeyAction` on `body` `keydown` (`TourRenderer.tsx:73`) | the dialog's `cancel` event |
| Step announcement | focus moves to the first focusable element of each new popover (`popover.ts:211-216`); no live region | focus moves to a selector after 100 ms; no live region | ours: focus the Stop's heading (`tabindex="-1"`) or the Next button on each Stop |
| Focus restored on close | yes, `__activeOnDestroyed` (`driver.ts:375`) | yes, `previousFocus` | native `close()` returns focus to the opener |

Neither library announces a Stop change through a live region; both rely on moving focus, which the
hand-rolled dialog does the same way. The difference that matters is containment: only the modal
`<dialog>` makes the page behind it genuinely unreachable to VoiceOver. The spotlit target is inert
too, which suits a Tour whose Stops only explain things (Next, not "tap here").

## Criterion 6 — bundle size

Measured above: driver.js **7.3 kB + 1.0 kB CSS**, react-joyride **27.3 kB** (Floating UI,
`@gilbarbara/hooks`, `react-innertext`, `scroll`, `scrollparent`, `deepmerge-ts`), Shepherd 16.1 kB,
intro.js 20.3 kB, @reactour/tour 9.6 kB, nextstepjs ≈ 47.7 kB with motion. A hand-rolled overlay is
a dialog, an SVG mask, a rect hook and a wait helper: a few kilobytes, and none of a library's
config surface or CSS to override for the design system. All of it loads only for members, behind
the auth guard.

## What a hand-rolled spotlight has to do

The list the prototype ticket ("How a Stop looks and moves") would build against:

1. A client `Tour` in `src/app/(member)/layout.tsx` owns the current Tour and Stop index.
2. One `<dialog>` opened with `showModal()` for the whole Tour; `pointer-events: auto` on it (in case
   a Radix layer has set `body` to `none`); `overflow: hidden` on `html` while open; the
   `::backdrop` transparent, because the dimming is our mask.
3. Per Stop: `router.push` if the Stop's route differs, wait for the target (MutationObserver +
   timeout), `scrollIntoView` with a bottom margin that clears the nav, then measure.
4. The cutout: an SVG covering the viewport with an even-odd path or `<mask>`, padded and rounded,
   re-measured on target `ResizeObserver`, `window` `scroll` with `capture: true`, and
   `visualViewport` `resize`/`scroll`, once per animation frame.
5. The text box: full width minus the 16 px gutters on a phone, placed above or below the cutout
   (whichever has more room), clear of `env(safe-area-inset-*)` and the bottom nav. No Floating UI
   needed at phone width.
6. Accessibility: the dialog labelled by the Stop's title, focus moved to the title or Next on each
   Stop, Escape (`cancel`) = dismiss the Tour, `prefers-reduced-motion` drops the cutout's
   transition.

## If we borrowed instead

driver.js, not react-joyride: a quarter of the size, the better route-crossing primitive
(`waitForElement` on a MutationObserver), and documented multi-page guidance. It would need: the
What's new dialog closed before a Tour starts; `refresh()` called by us on inner-scroller scrolls and
data-driven layout shifts; its CSS restyled to the design system; and acceptance of a JS-only focus
trap. react-joyride tracks movement better, but at 27 kB, with a document-height overlay and a
`z-index: 100` portal, it solves fewer of this app's specific problems per kilobyte.

## Open for the spec (not decided here)

- Whether a Stop may target something inside a Vaul sheet (rule 1 above), and the general "target
  not on screen" question already listed on the map.
- Whether `overflow: hidden` on `html` is enough to stop page scroll under the Tour on iOS standalone,
  or whether the touch-move guard Vaul uses is needed; check on a device in the prototype.
