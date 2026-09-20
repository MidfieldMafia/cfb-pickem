# design-sync notes

- **Source shape:** package (no Storybook). Component list comes from `packages/design-system/dist/*.d.ts`; `dist/` is built by the repo's `postinstall` (`npm run build --workspace @saturday-slate/design-system`). Run `npm ci` in a fresh worktree first.
- **No shipped CSS:** the package ships Tailwind 4 source + token CSS only. `.design-sync/compile-css.mjs` compiles it (PostCSS + `@tailwindcss/postcss`, scanning `packages/design-system/src` **and** `.design-sync/previews`) into `packages/design-system/.ds-compiled.css` (gitignored), which `cssEntry` points at. `buildCmd` runs it. Re-run it after adding classes to a preview, or previews render unstyled.
- **Fonts:** the app supplies `--font-chivo` / `--font-manrope` via `next/font` on `<html>`. A design project has none, so `compile-css.mjs` prepends a Google Fonts `@import` and defines the two variables. `runtimeFontPrefixes` silences `[FONT_MISSING]`. Fonts are therefore a remote dependency of every card.
- **`next/*` shims:** the bundle fails with `process is not defined` if `next/image` / `next/link` are bundled as-is. `.design-sync/tsconfig.json` (`paths`) aliases them to `.design-sync/shims/*` (plain `<img>` / `<a>`); `cfg.tsconfig` is `../../.design-sync/tsconfig.json` because config paths resolve from the package dir. The image shim also inlines `/brand/mark.svg` as a data URL so `Wordmark` / `AppHeader` show their mark.
- **Public assets:** the design project has no `public/`. Previews import pennant SVGs and logo PNGs from `../../public/...` (esbuild dataurl loader). The caller supplies `src` / `avatar.file` for `TeamLogo` and `Pennant`; the conventions header says so.
- **Playwright:** Chromium build 1243 is cached at `%LOCALAPPDATA%/ms-playwright`; it pins playwright **1.63.0** (`npm i playwright@1.63.0` in `.ds-sync/`).
- **Drawer** uses `cardMode: single` + `viewport: 390x520` so the fixed sheet renders inside its card.
- **Sub-parts** (CardHeader, DrawerContent, TableRow, ...) ship floor cards on purpose; they are composed inside their parent's preview (Card, Drawer, Table). Author a dedicated preview only if someone asks.

## Known render warns
- none at last run (`[RENDER_THIN]`/`[RENDER_BLANK]` on HeaderLinks and Progress were fixed by authoring previews).

## Re-sync risks
- Previews import `../../public/logos/*.png` and `pennants/*.svg`; renaming or removing those files breaks the preview build.
- The compiled stylesheet only contains utilities used by package source or previews. A new utility in a component needs a rebuild via `buildCmd`.
- Fonts load remotely from Google Fonts; offline renders fall back to system fonts.
- `dtsPropsFor` was not needed; prop extraction relies on `@types/react` in `.ds-sync/`.
- Grades are local (`.design-sync/.cache/review`); the uploaded `_ds_sync.json` is the cross-machine anchor.
