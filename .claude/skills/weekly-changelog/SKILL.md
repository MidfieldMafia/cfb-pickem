---
name: weekly-changelog
description: Write the week's What's new entry in CHANGELOG.md and open the PR. Use on the weekly changelog routine, or to catch the file up by hand.
---

# Write the week's changelog entry

`CHANGELOG.md` has two halves. `npm run changelog` owns the generated one and
needs nothing from you. This skill is the other half: the handful of bullets a
member of the league would notice, in their words.

Run it from a worktree of its own (`new-worktree`), on a Sunday, before the next
slate goes up. It ends in a PR Jonah merges, like everything else here.

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

Use `CONTEXT.md` terms exactly — Slate, Deadline, Group, Join Link, Pennant,
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

`npm run typecheck`, `npm run test` and `npx eslint src` all still apply, though
a prose-only week touches nothing they cover.

## 5. Open the PR

Title it `Changelog: <the range>`. In the body, say what you kept and — briefly
— what you left out and why, so the judgement is reviewable without rereading
every PR.

Nothing here is urgent. If the week is ambiguous, write fewer bullets and say so
in the PR rather than padding it.
