# What the GitHub deployments are, and what deleting them touches

Research date: 2026-10-26. Resolves [#502](https://github.com/MidfieldMafia/cfb-pickem/issues/502),
a sub-issue of the [Repo and routines](https://github.com/MidfieldMafia/cfb-pickem/issues/492) map.

Sources are the GitHub REST and Actions docs, the Vercel docs, and this repo's own data read
through `gh api` and the Vercel CLI on 2026-10-26/27 UTC. **Nothing was deleted or changed**: every
call below was a GET. Where a claim is an inference from the data rather than something a doc says,
it is marked as one.

## 1. What they are, and who makes them

**All 642 records were created by `vercel[bot]`** (`GET /repos/{owner}/{repo}/deployments`, every
page). The ticket's 638 was the count a few days earlier; previews keep adding to it.

| Environment | Records | Oldest | Newest | Latest status |
| --- | --- | --- | --- | --- |
| Preview | 389 | 2026-09-05 | 2026-10-27 | 368 `success`, 20 `failure`, 1 with no status |
| Production | 253 | 2026-09-05 | 2026-10-26 | 250 `success`, 2 `inactive`, 1 `failure` |

By month: Production 184 in September, 69 in October; Preview 230 in September, 159 in October.

- **One record per Vercel deployment.** `ref` is the commit SHA, not a branch name, `task` is
  `deploy`, `payload` is empty, and every record has `transient_environment: false` and
  `production_environment: false`, including the Production ones.
- **Production = one per push to `main`.** 253 of the 253 Production SHAs are first-parent commits
  of `origin/main` (there are 257 first-parent commits, so a few pushes were never recorded).
- **Preview = one per push to any other branch.** 389 records over 388 distinct SHAs. None of the
  Preview SHAs is on `main`'s first-parent line, because squash merges give `main` new SHAs.
- **Each record's status points at Vercel.** The `success` status carries `environment_url` (the
  `cfb-pickem-<hash>-jonahmabry-3517s-projects.vercel.app` deployment URL) and `log_url`/`target_url`.
- **The two GitHub environments, `Preview` and `Production`, were made by those records**, on
  2026-09-05, the day of the first deploy. Neither has protection rules or a branch policy
  (`GET /repos/{owner}/{repo}/environments`). No repo workflow uses them, nor `deployment`,
  `deployment_status` or `repository_dispatch` events (`grep` of `.github/`, `.claude/`).
- Vercel says why it writes them: "Vercel for GitHub uses the deployment API to bring you an
  extended user interface both in GitHub, when showing deployments, and Slack", and its `Deployments`
  permission "Allows us to synchronize deployment status between GitHub and the Vercel
  infrastructure" ([Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github)).

### Why nearly all of them are still "active"

GitHub's rule is that a `success` status inactivates prior deployments in the same environment
unless the creator opts out: `auto_inactive` "Adds a new inactive status to all prior non-transient,
non-production environment deployments", default `true`
([deployment statuses](https://docs.github.com/en/rest/deployments/statuses)). Only 2 of 642
records have ever received an `inactive` status, so **Vercel evidently sends `auto_inactive: false`**
(inference: no doc of Vercel's says so). That matters for deletion, below.

## 2. What deleting a record touches

### The rule for deleting

"If the repository has more than one deployment, you can only delete inactive deployments." To make
one inactive, "Mark the active deployment as inactive by adding any non-successful deployment
status" ([deployments](https://docs.github.com/en/rest/deployments/deployments)). So each delete is
two calls: `POST .../deployments/{id}/statuses` with `state: inactive`, then
`DELETE .../deployments/{id}`. With 640 active records, a backfill is about 1,280 calls.

GitHub on the `inactive` state: "Setting the `state` to `inactive` shows the deployment as
`destroyed` in GitHub and removes access to it" (same page) — that is, the PR timeline's
"View deployment" button goes; nothing is sent to Vercel.

### The Vercel deployment and its URL: untouched

The two are separate objects, and the data shows it in the other direction already:

- The oldest Production record (2026-09-05, `cfb-pickem-np76mn329-…`) still reads `success` on
  GitHub, while `vercel inspect` answers "Can't find the deployment" — Vercel's retention removed it
  and **left the GitHub record as it was**. The newest one (`cfb-pickem-7b8pivntl-…`) inspects fine.
- Vercel's documented controls over a deployment's life are its own: retention policy, "Recently
  Deleted" restore, `vercel remove` ([deployment retention](https://vercel.com/docs/deployment-retention)).
  None reads GitHub's record.
- No Vercel doc says it reads deployment records back from GitHub; every Vercel→GitHub flow
  documented (deployment records, commit statuses, check runs, PR comments, `deployment_status`
  and `repository_dispatch` events) is outbound. **Inference:** deleting the GitHub record does not
  remove, expire or change the Vercel deployment or its URL. Deleting a GitHub environment likewise
  only "will delete all secrets and protection rules associated with the environment"
  ([managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)),
  and these two have none.

### Rollbacks: untouched

Instant Rollback is a Vercel dashboard or CLI action over Vercel's own list: "Deployments previously
aliased to a production domain are eligible", and "Hobby users can roll back to the immediately
previous deployment" ([Instant Rollback](https://vercel.com/docs/instant-rollback)). GitHub's
records play no part. What limits rollback here is Vercel retention, not GitHub (see §4).

### PR checks: untouched

The "Vercel" check on a PR is a **commit status** (context `Vercel`, from `vercel[bot]`), and
"Vercel Preview Comments" is a **check run** from the `vercel` app — both read from
`GET .../commits/{sha}/statuses` and `.../check-runs` on the newest Preview SHA. Neither is a
deployment record, so deleting records does not change them. `main` has no branch protection and
no rulesets, so no "require deployments to succeed" rule exists to break either.

### What does go

- The PR timeline's deployment entries and "View deployment" buttons for pruned SHAs.
- The repo sidebar's "Deployments" list and the per-environment history at
  `/deployments`, which is the clutter #502 is about.
- Workflows: none here listen for deployment events, and GitHub does not start a run for
  `deployment_status` "When a deployment status's state is set to `inactive`"
  ([events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).

## 3. What can prune them automatically

**No Vercel setting stops the records while keeping deploys.** The Git options are
`git.deploymentEnabled`, `github.autoAlias`, `github.autoJobCancelation` and the deprecated
`github.silent`/`github.enabled` ([Git configuration](https://vercel.com/docs/project-configuration/git-configuration));
`deploymentEnabled: false` stops the deployments themselves. The dashboard toggle that disables
`deployment_status` events is described only as keeping them out of the PR's history
([changelog](https://vercel.com/changelog/optionally-disable-deployment_status-webhook-events-for-github-actions));
whether it also stops the records is not stated, so it is unverified. Pruning has to be an Action.

**Recommended: one workflow shaped like `.github/workflows/neon-preview-cleanup.yml`** — PR close
plus a weekly sweep plus `workflow_dispatch` with `dry_run` — under `permissions: deployments: write`
(plus `pull-requests: read`):

- **On `pull_request: closed`:** list the PR's commits (`GET /pulls/{n}/commits`, which returns up
  to 250) and prune every `Preview` record whose `sha` is one of them. Records carry a SHA, not a
  branch, so matching by the PR's commits is the only exact join.
- **Weekly sweep:** prune `Preview` records older than 14 days unless the SHA is the head of an open
  PR (catches pushes made before a PR existed and closes that failed), and prune `Production`
  records beyond the newest 10.
- **Each prune is inactive-then-delete**, and a 404 or an already-inactive record should pass, as
  the Neon job treats a branch that was already gone.
- **Cap a run's work.** `GITHUB_TOKEN` gets "1,000 requests per hour per repository", and
  content-creating requests are limited to "80 … per minute" and "500 … per hour"
  ([REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
  Every inactive status is a content-creating request, so the ~640-record backlog cannot clear in one
  run: either cap each run at about 200 prunes and let `workflow_dispatch` runs work through it, or
  clear the backlog once by hand with a personal token, pausing between batches. After that, steady
  state is a handful per PR.

A scheduled-only job would also work but leaves a closed PR's records up to a week; the PR-close
trigger alone would never touch Production or pre-PR pushes. Both together mirror what the Neon
cleanup already does for the same reason.

## 4. What is worth keeping

- **Every record whose SHA is the head of an open PR** (today 1 of the 2 open PRs has one): that is
  the PR's live "View deployment" link.
- **The newest 10 Production records.** The record is only a link, but it is the one place GitHub
  shows which commit went live and when. Vercel keeps no more than that to point at anyway: the
  oldest Production deployments are already gone from Vercel, which fits Hobby's 30-day default
  and its "Last 3" Ready-production exception ([deployment retention](https://vercel.com/docs/deployment-retention));
  older records link to deployments that no longer exist. The 10th newest today is 2026-10-24.
- **Both environments.** Vercel recreates them on the next deploy if deleted, they carry no secrets
  or rules, and deleting them gains nothing.
- Everything else — 309 Preview records are older than 2026-10-12 alone — links to merged or
  abandoned branches and can go.

The Vercel plan was not read directly; "Hobby" above is inferred from retention behaviour.
