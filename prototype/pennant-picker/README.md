# Prototype: pennant picker with team logos

**Throwaway.** This branch is a record, not code to ship. Nothing here is
imported by the app, the tests or the build, and this directory must never be
merged to `main`.

Built 2026-09-21 to answer the two design questions blocking
[#217 Pennants: pick your team's logo](https://github.com/MidfieldMafia/cfb-pickem/issues/217).

## What is here

Only the designs that were **chosen**. Each file is one self-contained
`.dc.html` artboard from the Design canvas at
<https://claude.ai/artifact/AiDyL7Ww2ufC25EykenXZN>.

| File | Answers | Decided in |
| --- | --- | --- |
| `PennantPicker.dc.html` | How you browse 136 team logos on a phone | [#224](https://github.com/MidfieldMafia/cfb-pickem/issues/224) |
| `PennantDisc.dc.html` | How a team logo sits in the Pennant disc | [#225](https://github.com/MidfieldMafia/cfb-pickem/issues/225) |

`generate-picker.mjs` and `generate-disc.mjs` emit them. The picker generator
reads `src/lib/logos.json` from the repo, so it is the honest record of where
the data came from; run it from the repo root with `node
prototype/pennant-picker/generate-picker.mjs`.

## What is deliberately not here

The options that lost: two rival browse patterns (a tabbed conference scroll,
and a search-first list) and four rival disc treatments (drop the tint, bleed
and crop, a squircle, and a small-size fallback). They are still on the canvas,
which both tickets link, so the reasoning behind the choice is preserved without
carrying dead designs in the repo.

## The decisions, in short

**Browse (#224).** Three levels. The picker opens on two choices — Flags (12)
and Team Logos (136 in 11 conferences). Team Logos leads to a conference list, a
conference to a named grid. Back walks out one level at a time. Three taps to a
team, accepted as the price of an opening where flags and teams do not compete
for one screen.

**Disc (#225).** A logo sits inside the disc at 72% with `object-fit: contain`,
over the existing 18% tint of the school's `colors.primary`. A flag keeps
bleeding past the edge at 125%. One code path at 72, 44, 28 and 20 — no crop, no
second shape, no small-size fallback.

## Two traps these files encode

- **The 136 logos are not `small`.** `logos.json` carries a 150px `file`
  (`public/logos/<slug>.png`) and a 32px `small`
  (`public/logos/espn/<espnId>.png`). The prototype first used `small`, because
  the `espnId` filename keying makes it the convenient join, and shipped visibly
  blurry discs until it was repointed. The pennant flow wants `file`.
- **Conferences are not in the data.** `logos.json` has no `conference` field.
  `generate-picker.mjs` reconstructs the eleven runs from the file's array
  order, which is fine for a prototype and is not fine to ship — see #217, which
  carries adding the field as a cost of this design.

## Caveat on the asset URLs

Every `/_blob/<id>` in the two `.dc.html` files points at an asset uploaded to
that one Artifact. They resolve there and nowhere else. To rebuild against a
different canvas, re-upload the logos and replace the `SLUG` / `FLAG_BLOB` maps
in the generators.
