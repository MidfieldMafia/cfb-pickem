---
name: weekly-changelog
description: Write the week's What's new entry in CHANGELOG.md and the What's new modal, and open the PR. Use on the weekly changelog routine, or to catch the file up by hand.
---

# Write the week's changelog entry

`CHANGELOG.md` has two halves. `npm run changelog` owns the generated one and
needs nothing from you. This skill is the other half: the handful of bullets a
member of the league would notice, in their words. It also writes the What's new
modal, which is how members actually see them: it opens by itself once for each
new entry, and the Profile menu's What's new row reopens it.

Run it on a Thursday morning, and understand why it is that day rather than the
start of the week. Most of a week's shipping happens Monday to Wednesday, aimed
at being ready before that week's Deadline. An entry written on Monday covers
only the week behind it, so a fix that shipped Wednesday *for this week* would
not be announced until the next one — by which time everyone has already played
the week it was for. Thursday catches it, and lands while members are opening
the app to pick.

It ends in a PR Jonah merges, like everything else here.

Locally, take a worktree of its own (`new-worktree`). The weekly routine runs in
a cloud sandbox that is already an isolated checkout, so there it just branches
from `origin/main` and runs `npm ci`. It has no `.env.local` and needs none —
nothing here reaches the database.

## 1. Read what merged

```bash
npm run changelog -- --digest
```

That prints every PR merged since the last entry ended — title, author, and the
whole body, which in this repo means its "What changed" and "Judgement calls".
Read the bodies, not just the titles. The title is written for us; you are
writing for someone who has never seen the repo.

It also prints the exact heading for the new entry. Use it verbatim. The range
is dates, deliberately not a Week number — see `scripts/changelog.ts` for why.

If it says nothing has merged, stop. Do not open an empty PR.

## 2. Keep only what a member would notice

Most weeks, half of what merged does not belong here. Cut:

- refactors, seams, test coverage, type work — anything whose result is the same
  screen it was before,
- tooling, lockfiles, CI, docs, skills, design-system plumbing,
- anything behind the commissioner console, unless a commissioner asked for it.

Keep what changes what someone sees or can now do. A fix counts when the thing
it fixed was visible: a blurry title on iOS is worth a line, a `useMemo` is not.

Five to ten bullets is a normal week. One is a fine week. Zero means step 1 was
right and there is no entry to write.

## 3. Write them in the app's language

Use `GLOSSARY.md` terms exactly — Slate, Deadline, Group, Join Link, Pennant,
Lock of the Week, Played Week. They are what the screens say, so they are what
the reader already knows.

Address the reader as "you", say what is now true rather than what was done to
the code, and leave out PR and issue numbers — the generated half below already
has every one of them.

> - The Live Board shows possession, down and distance, and the last play while
>   games are running.
> - A week you make no picks in no longer drags your average down. It simply
>   doesn't count.

not

> - Carried `possession`, `lastPlay` and `situation` from `/scoreboard` to the
>   Live Board wire (#214).
> - Fixed `played` flag handling in the engine (#161).

## 4. Put them in the file and regenerate

Add the heading and bullets inside the `<!-- whats-new:start -->` markers,
above the previous entry — newest first. Then:

```bash
npm run changelog
```

That rewrites the generated half and derives `src/data/changelog.json` from the
prose you just wrote. Both files belong in the commit. Check the JSON picked up
your entry; if `entries` did not grow, the heading is malformed.

## 5. Write the modal's entry

The modal does not read `CHANGELOG.md`. Its copy is the `ENTRY` constant in
`src/components/whats-new.tsx`, and you replace it each week:

- **`id`**: the first date of the heading's range (`2026-09-28` for
  `### 2026-09-28 to 2026-10-03`). A new `id` is what opens the modal again for
  every browser, so it changes exactly when there is a new entry.
- **`label`**: `What's new · ` and the range in short dates, `Sep 28–Oct 3`, or
  `Oct 5–10` within one month.
- **`items`**: the shortlist, not a copy. Take the three to five bullets a
  member would most want pointed out, newest features first; fixes and
  background changes stay in the CHANGELOG only. Each item is a `title` of a few
  words in sentence case with no period, and a `body` of one sentence (two at
  most) on what you can now do and where. Same voice and terms as the bullets.
- **`icon`**: a `lucide-react` icon that names the thing (`Radio` for live
  games, `SmilePlus` for reactions). Add it to the import and drop any the old
  entry used that the new one does not — ESLint fails on an unused import.

If every bullet this week is a fix or a background change, leave `ENTRY` alone
and say so in the PR: a modal that opens for nothing teaches members to close it
unread.

## 6. Check it

A normal week now changes `CHANGELOG.md`, `src/data/changelog.json` and
`src/components/whats-new.tsx`. The last is a client component, so commit, then
run `npm run preflight`: it builds first, which also writes the `.next/types`
that `typecheck` needs on a cold checkout, then runs typecheck, test and eslint.

## 7. Open the PR

Title it `Changelog: <the range>`. In the body, say what you kept and — briefly
— what you left out and why, so the judgement is reviewable without rereading
every PR. Then list the modal's items as title/body pairs (or say the modal was
left alone, and why), so its copy can be reviewed without opening the
TypeScript.

Nothing here is urgent. If the week is ambiguous, write fewer bullets and say so
in the PR rather than padding it.
