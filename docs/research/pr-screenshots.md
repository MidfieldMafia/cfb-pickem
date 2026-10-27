# Where screenshots on visual PRs should live

Research date: 2026-10-26. Resolves [#512](https://github.com/MidfieldMafia/cfb-pickem/issues/512),
a sub-issue of the [Repo and routines](https://github.com/MidfieldMafia/cfb-pickem/issues/492) map.
Feeds [#513](https://github.com/MidfieldMafia/cfb-pickem/issues/513).

**Question.** Where should screenshots of a visual change live, so that every PR touching the app
can carry them, not only `agent:go` builds? Four hosts are compared on four criteria: whether a local
session and a cloud routine can both upload, whether the image renders inline in a PR body, what it
does to repo size, and what it publishes, given the repo is public and screens show members' names.

**Sources.** This repo at `origin/main` `d3543f9` (`scripts/agent-shots.ts`,
`.claude/skills/agent-go/SKILL.md` and `shoot.cjs`, `scripts/agent-db.ts`,
`docs/agents/cloud-environment.md`); the `agent-screenshots` branch, measured read-only with git; the
GitHub REST API (`repos/MidfieldMafia/cfb-pickem`); the installed `gh` 2.100.0 and the `cli/cli`
source at tags `v2.100.0`–`v2.103.3` (`internal/attachments/*.go`, `pkg/cmd/{issue,pr}/*`); GitHub's
[Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
and [About anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)
docs; the GitHub changelog
[GitHub CLI: media in issues, pull requests and comments](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments)
(2026-09-01); Vercel's [Vercel Blob](https://vercel.com/docs/vercel-blob) docs (last updated
2026-08-26) and [Signed URLs](https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob)
changelog; the Artifact tool's own description in this session. **Nothing was uploaded**: a
user-attachment cannot be deleted (§2), so a test upload would have left a permanent public file.

## Summary

| | Local uploads | Cloud uploads | Inline in a PR body | Repo size | Can a mistake be taken back |
|---|---|---|---|---|---|
| **`agent-screenshots` branch** (today) | yes | yes, proven by 9 runs | yes | +12.7 MB so far, in every clone | yes, by rewriting the branch |
| **GitHub user-attachments** (`gh … --attach`) | yes, `gh` ≥ 2.99 | **unproven** (token and allowlist) | yes | none | **no** |
| **Vercel Blob, public store** | yes, with a token | needs a new network secret | yes | none | yes, `del()` (≤ 60 s CDN lag) |
| **Vercel Blob, private store** | yes | as above | **no** | none | yes |
| **claude.ai Artifact** | yes | unproven | **no**, a link only | none | yes, delete |

**Recommendation.** What a screenshot may show matters more than where it lives: every host that
renders inline in a GitHub PR body is world-readable, because GitHub's image proxy fetches
anonymously (§0). So the rule that already guards `agent-shots`, **only the fake `agent-db` league is
ever screenshotted for a PR**, stays the precondition for every session, local ones included
(`agent-db` runs by hand with `NEON_API_KEY`, `scripts/agent-db.ts:16-18`). Under that rule, the host
should move to **GitHub user-attachments through `gh pr create|edit|comment --attach`**: no repo
growth, inline rendering, no branch to keep, and already in the `gh` every session has. Its one
unknown is whether the cloud's proxied token may upload; until a cloud probe answers that, the
routine keeps the branch. A screenshot that has to show real data (the Development database) goes in
a private Artifact linked from the PR, never inline.

## 0. Why "inline" means "public"

GitHub serves every markdown image through Camo, which "generates an anonymous URL proxy for each
file"; an image "served from a private network or from a server that requires authentication"
cannot be shown ([About anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)).
So an image renders in a PR body only if an anonymous request can fetch it. Any inline option
publishes the image to anyone holding its URL, and on a public repo the PR body hands the URL to
everyone. The four hosts differ only in how guessable the URL is and whether it can be withdrawn.

## 1. The `agent-screenshots` branch (today)

**How it works.** `npm run agent-shots -- <issue> <dir>` builds a commit with git plumbing against a
scratch index, pushes it to `refs/heads/agent-screenshots` (retrying a lost race up to three times),
and prints a before/after table of `<img src="https://raw.githubusercontent.com/<repo>/<commit>/…"
width="300">` links pinned to the commit (`scripts/agent-shots.ts:45-74, 96-106`). It refuses to
run without `.agent-db.json`, i.e. without a fake-league branch up (`agent-shots.ts:81-83`), and
refuses any file over 3 MB (`:24, 90-92`).

**Measured on 2026-10-26** (`git fetch origin agent-screenshots`, then `git rev-list --count`,
`git ls-tree -r -l`):

- **14 commits** since 2026-10-15: 9 real tickets (#334, #436, #454 twice, #455, #456, #475,
  #480, #482) and 5 commits for a test issue `#9999` that were never cleaned up.
- **87 PNGs, 12.7 MB** in the tip tree. The script only adds files, so the tip holds every blob the
  branch has ever had. The 73 real shots average **147 KB**; the largest are 400 KB
  (`454/…/console-picks`), full-page at 390 px × 2 DPR. That is about **1.4 MB per ticket**.
- For scale, `main`'s whole tip tree is **8.5 MB** across 853 files, and GitHub reports the repo at
  **23.5 MB** (`size: 23476` KB). The screenshots are already larger than the code.

**Local and cloud.** Both can push: it uses plain `git push origin`, which works in the cloud
through its git proxy (`docs/agents/cloud-environment.md`, "`curl`, `git` and `gh` need nothing"),
and every routine run above did so.

**Inline.** Yes: `raw.githubusercontent.com` on a public repo answers anonymously.

**Repo size.** This is the cost. `git clone` fetches every branch by default, so every fresh clone,
including each cloud routine's checkout, downloads the screenshots, and so does any `git fetch` of
all branches. Opening it to every visual PR, not only `agent:go`, multiplies the growth. PNGs do not
delta-compress against each other, so packing does not help.

**What it publishes.** Exactly what is committed, at a URL anyone can list by browsing the branch
on GitHub: it is not just public, it is indexed. The only protection is the `agent-db` gate.
**A mistake can be taken back**: rewrite the branch without the file and force-push. Links pinned to
the old commit then stop resolving once GitHub garbage-collects it (not on any stated schedule), and
every past PR's images on that branch break if the rewrite drops their commits.

## 2. GitHub user-attachments (`gh --attach`)

**There is a supported non-browser upload path, but not a documented REST API.** The GitHub
changelog of 2026-09-01 announces a repeatable `--attach` flag on `gh issue create|edit|comment` and
`gh pr create|edit|comment`, "generally available to all users … across all plans", needing
`gh` v2.99.0. The installed `gh` is 2.100.0 and `gh pr create|edit|comment --help` all list
`--attach file` (`gh pr create --help` prints it; it is not hidden). The `cli/cli` source carries
`attachments.AddFlag` in all six commands at every tag from `v2.100.0` to the current `v2.103.3`.
The REST docs list no endpoint for it; the [Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
page mentions only the web UI and "GitHub CLI".

**What it calls** (`internal/attachments/client.go`, `v2.100.0`): `POST
https://uploads.github.com/user-attachments/assets?name=…&content_type=…&repository_id=<numeric id>`
with the file as the body and `gh`'s own token, returning `{"url": …}`. It refuses GitHub Enterprise
Server, and refuses a viewer permission other than `ADMIN`, `MAINTAIN` or `WRITE` (the endpoint
answers 404, not 403, to a token that cannot write). Images up to **10 MB**; PNG, JPEG, GIF, WebP and
SVG, plus three video types (`userasset.go`). Up to 50 per command.

**Local sessions: yes.** The changelog: uploads use "the OAuth token from `gh auth login` or a
classic personal access token"; write access is required. Both commissioners have it.

**Cloud routine: unproven, and the likeliest place this fails.** Three unknowns, none of which
this session can test:

1. **The token.** The source says "the credential is left to the endpoint, which accepts tokens
   from only some GitHub Apps" (`client.go`, `NewUploader`), and the changelog names only OAuth
   and classic PATs. The cloud's `gh` reaches GitHub through a proxy that supplies the credential;
   `gh auth status` there "reports an invalid token regardless" (`cloud-environment.md`). Whether
   the proxy's credential is one the endpoint accepts is unknown.
2. **The host.** The upload goes to `uploads.github.com`, not `api.github.com`. Whether the
   environment's default allowlist and the proxy's credential injection cover it is unknown.
3. **`viewerPermission`.** `gh` reads it from GraphQL first and refuses anything below WRITE, but
   lets an empty value through to the endpoint (`checkPermission`), so an App token is not refused
   locally.

A probe answers all three at once: one `gh pr comment <throwaway PR> --attach blank.png` from a
disabled routine (`docs/agents/cloud-environment.md`, "Testing a routine"). Use a blank image, since
the upload is permanent.

**Inline: yes**, as markdown. `gh` rewrites a markdown reference to an attached path in place,
`![alt](./before.png)` or `[text](./before.png)`, and appends any attached file the body never
mentions (`references.go`). It does **not** rewrite an HTML `<img src="./before.png">`, which is what
`agent-shots` prints today to set `width="300"`; such a file would be appended at the end and the
`<img>` left broken. A body built for `--attach` uses `![…](./path)` in the table cells.

**Repo size: none.** The asset is stored outside git.

**What it publishes.** "For public repositories, uploaded files can be accessed without
authentication" (Attaching files). The URL is an unguessable asset id and is not listed anywhere
except the body that references it, so it is less exposed than a browsable branch, but anyone who
reads the PR has it. **A mistake cannot be taken back**: `gh`'s own package doc says "An upload
cannot be undone" (`internal/attachments/doc.go`), and GitHub's docs describe no way to delete one.
Editing the body removes the reference, not the file. A file uploaded and then never written into a
body is stranded but still public, which is why `gh` uploads only after every prompt has passed.

## 3. Vercel Blob

**Public store.** Writes need authentication; reads are "anyone with the URL", served from the CDN;
`addRandomSuffix` makes the pathname unguessable ([Vercel Blob](https://vercel.com/docs/vercel-blob)).
It renders inline. It can be deleted, with changes taking "up to 60 seconds to propagate", though
GitHub's Camo may keep its own copy. It adds nothing to the repo.

**Private store.** "Read access: Authenticated (token required)", delivered "through your
Functions". Camo cannot fetch it, so it **does not render inline** (§0). Signed URLs would let Camo
fetch it, but they expire "up to 7 days" out, so the PR's images would break within a week.

**Uploading.** Outside Vercel it needs the long-lived `BLOB_READ_WRITE_TOKEN` ("Use the read-write
token only when your code runs outside Vercel, such as in a CI job"). Locally that is one more secret
in `.env.local`. In the cloud the VM holds no secrets by design; it would take a new network secret
for `*.blob.vercel-storage.com`, as Neon and TypeSafe have, plus a store, plus a script. Blob is
billed per advanced operation and GB-month, small at this scale.

**Against user-attachments** it gains only deletion, and loses on setup: a store, a token per
environment and a script to maintain, for the same public URL.

## 4. claude.ai Artifacts

An Artifact is a page on claude.ai, **private by default**, shared with named people by its owner
(the Artifact tool's description). It cannot be a markdown image: it is an HTML page behind a
claude.ai sign-in, which Camo cannot fetch, so a PR can carry only a link. It adds nothing to the
repo and can be deleted. Whether a cloud routine has the Artifact tool is not recorded in
`cloud-environment.md`, so it is unproven there.

It publishes nothing to GitHub, which makes it the one host here fit for a screenshot of real data:
a check against the Development database, shared with the other commissioner, linked from the PR.
It is not a home for the routine's before/after pairs, which exist to be seen at a glance in the PR.

## 5. What this means for #513

- **Keep the fake-league gate whatever the host.** It is the only thing between a member's name and
  a public URL, and with user-attachments there is no undo. A local session that wants inline
  screenshots runs `npm run agent-db -- up` by hand (`NEON_API_KEY` for `slate-agents`), the same as
  the routine.
- **`agent-shots` can keep its interface** (`<issue> <dir>` in, a Screenshots section out) and swap
  its back end: print `![before](./before--key.png)` cells and pass each file to
  `gh pr create|edit --attach`. Because the asset URL exists only after the upload, the natural
  order is to open the PR first and then `gh pr edit <n> --body-file … --attach …`, or to post the
  table as a `gh pr comment --attach`.
- **The routine moves only after a cloud probe passes** (§2's three unknowns). If the cloud cannot
  upload, it keeps `agent-screenshots`; a cheaper variant is pushing to a separate screenshots
  repository so clones of this one stay small, but the cloud's git proxy may be scoped to this
  repository only, which would need the same probe.
- **Once nothing writes to `agent-screenshots`**, deleting it stops the clone cost; doing so breaks
  the images in the PRs that point at it, which were all merged as of 2026-10-26. The five `#9999`
  test commits can go either way.
