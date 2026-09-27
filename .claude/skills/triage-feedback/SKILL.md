---
name: triage-feedback
description: Turn the members' in-app bug reports and ideas into GitHub issues and comments. Use on the weekend feedback pass, or when asked what members have reported.
---

# Triage the week's Feedback

Members send bugs and ideas from the You screen into the `feedback` table
(#237). Commissioners read them in the console; nothing reaches GitHub on its
own. This pass files each open one against the tracker: a comment on the issue
that already covers it, or a new issue.

It writes nothing to the database. Filing an item under Done in the console
stays the commissioner's call.

## 1. Export what is open

From any checkout with `node_modules` and `.env.local`, such as the main one or
a warmed worktree. Nothing here changes code, so it needs no worktree of its own:

```bash
node --env-file=.env.local .claude/skills/triage-feedback/export.mjs <scratchpad>/feedback
```

It prints the database host, which should be production (the one real members
write to), and one line per Feedback whose `done_at` is null. It also writes
`feedback.json` with the full text and user agent, plus a `feedback-<id>.jpg`
per screenshot.

Drop the ones an earlier pass already filed. Every issue and comment this
skill writes cites `Feedback #<id>`, and that phrase is the key:

```bash
for id in <ids>; do echo "#$id: $(gh search issues -R MidfieldMafia/cfb-pickem "\"Feedback #$id\"" --json number --jq "[.[].number | select(. != $id)] | join(\",\")")"; done
```

It matches comments as well as bodies. It also returns issue `#<id>` itself,
which the `select` drops. Anything left means that id was already filed.

**Done when** you have the list of unfiled ids.

## 2. Look at every screenshot

Read each `feedback-<id>.jpg` before matching anything. The text says what the
member felt, and the screenshot says which screen and which state. In the
2026-09-26 pass, three of fifteen items moved to a different issue once their
screenshot was seen: "tabs floated" was not the Live Board, "which team has the
ball" was the Live Board and not the Game sheet, and "logos in dark green
bubbles" was a Game sheet chip rather than the Pennant disc.

Several items often describe one bug. Group them now.

**Done when** each item names the screen, the state and the component.

## 3. Match against the tracker

```bash
gh issue list -R MidfieldMafia/cfb-pickem --state all --limit 500 --json number,title,state
```

Scan every title, then `gh search issues` the item's key terms, which also
searches bodies. Read the body and last comment of each candidate. A title
match is a guess; the body says what was actually built.

Each item lands in one bucket:

- **Open issue covers it**: comment there.
- **A closed issue should have prevented it**: a regression, or a surface the
  fix never reached. File a new bug that cites the closed one, and put a short
  comment on the closed one pointing to it.
- **Nothing covers it**: new issue.

Check `git log origin/main` for the past week too. A PR may have shipped part
of an idea since the member wrote it, as #328's Profile menu did for
"put Send feedback beside What's new".

**Done when** every item has a bucket and an issue number or "new".

## 4. Ground the bugs in the code

For each new bug, find the code that renders or computes it on `origin/main`,
and name the file and function in the issue. Label it a hypothesis unless you
have proved it; `docs/agents/issue-tracker.md` treats a ticket's account of the
code as a claim someone will audit.

## 5. Show the plan, then file

This repo is **public**, and filing is outward-facing. Show Alex the triage
table (Feedback id, bucket, target issue or proposed title, owner) and file only
after they approve it.

Write each body to a scratchpad file and pass it with `-F`, per the global
CLAUDE.md. For every issue and comment:

- Open with `From in-app Feedback #<id> (<date>)`, so step 1 finds it next time.
- Quote the member's words. Call them "a member". Alex and Jonah can be named,
  as the tracker already does, but other members' names stay out.
- **Describe** each screenshot in words. Screenshots show other members' names
  and photos, so they are never uploaded.
- Labels: `bug`, `enhancement` or `question` for an open decision, plus the
  owner label and matching assignee from `docs/agents/issue-tracker.md`
  (`owner:alex` for screens and visuals, `owner:jonah` for data, logic and
  infrastructure). Leave out roadmap sub-issue links unless Alex asks for them.

**Done when** every unfiled id from step 1 appears in an issue or comment.

## 6. Report

End with a table mapping each Feedback id to the issue or comment URL. Then
list the ids the commissioner can now file under Done in the console.
