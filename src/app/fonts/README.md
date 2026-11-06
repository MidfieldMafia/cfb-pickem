# Fonts

Chivo (display) and Manrope (body), loaded by `next/font/local` in
`src/app/layout.tsx`. They live in the repo so a build never fetches from
Google: `next/font/google` made every build depend on what Google answered,
and on 2026-11-05 Google answered Turbopack with `/l/font?kit=…&skey=…` URLs
that Turbopack cannot parse, so `next build` failed with no change here.

Each file is the family's variable font (the whole `wght` axis), cut to
Google's `latin` and `latin-ext` ranges, every OpenType feature kept
(`tnum` included). Cyrillic, Greek and Vietnamese fall back.

| File | Source | Weights |
| --- | --- | --- |
| `Chivo-wght.woff2` | `ofl/chivo/Chivo[wght].ttf` | 100–900 |
| `Manrope-wght.woff2` | `ofl/manrope/Manrope[wght].ttf` | 200–800 |

Sources are from [google/fonts](https://github.com/google/fonts) `main`;
licences are the `*-OFL.txt` files beside them (SIL Open Font License 1.1).

To rebuild one, with `pip install fonttools brotli`:

```bash
curl -sSfLo Manrope.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf'
python3 -m fontTools.subset Manrope.ttf --layout-features='*' --flavor=woff2 \
  --output-file=src/app/fonts/Manrope-wght.woff2 \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
```
