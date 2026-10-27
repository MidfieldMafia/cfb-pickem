# Starting a routine when a member sends Feedback

Research date: 2026-10-26. Resolves [#508](https://github.com/MidfieldMafia/cfb-pickem/issues/508),
a sub-issue of the [Repo and routines](https://github.com/MidfieldMafia/cfb-pickem/issues/492) map,
and feeds the grilling in [#509](https://github.com/MidfieldMafia/cfb-pickem/issues/509).

**This is the facts, plus one recommended shape.** #509 makes the decisions. Sources:

- Claude Code docs, [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines) ("routines")
  and [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments)
- Claude Platform docs, [Trigger a routine through the API](https://platform.claude.com/docs/en/api/claude-code/routines-fire)
- Vercel docs, [Config and Secret environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- The Next.js 16.3.4 docs bundled at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
- This repo on `main` at `d3543f9`, and `docs/agents/cloud-environment.md`

Routines are in research preview, and the `/fire` API is marked experimental: "Request and
response shapes, rate limits, and token semantics might change" (Platform docs). Every number below
is as of today.

## The short answer

1. **The app calls the routine's API trigger.** After the Feedback row is written, the send action
   POSTs `{"text": "Feedback #<id>"}` to the routine's `/fire` URL from `after()`, so the member's
   Send never waits on it. The fire URL and its token are two **Secret** variables in Vercel,
   Production only.
2. **One fire per Feedback, but the run sweeps.** The run triages every open, unfiled Feedback, not
   only the id it was fired for, so a missed or failed fire is picked up by the next one and a busy
   Saturday converges. The hourly caps (30 fires per routine) are far above the app's volume.
3. **The run reads Feedback through the app, not the database.** A bearer-gated, read-only route on
   the production domain returns open Feedback and its screenshot. Its key is a **network secret**
   on the routine's cloud environment, so it never enters the VM, and no database URL does either.
   That environment should be the routine's own, not the one `agent:go` shares.

A GitHub event cannot carry this: routine GitHub triggers do not include `repository_dispatch`, and
anything the app put on GitHub to start one would publish a member's words before triage.

## 1. How an app event can start a routine

A routine (now "scheduled task") can have three kinds of trigger: **Schedule**, **API** and
**GitHub** (routines doc, intro). A routine needs no schedule: "A task with only an API trigger
runs when you call its endpoint."

### The API trigger

From the routines doc ("Add an API trigger", "Trigger a scheduled task") and the Platform reference:

- **Endpoint**: `POST https://api.anthropic.com/v1/claude_code/routines/{routine_id}/fire`. The id
  is prefixed `trig_`. The web UI shows the full **Fire URL** when the API trigger is added.
- **Headers**: `Authorization: Bearer <token>` (prefixed `sk-ant-oat01-`), `anthropic-version`
  (any version from `2023-06-01` on behaves the same; the reference shows `2026-10-21`), and
  `Content-Type: application/json` when there is a body. The older
  `anthropic-beta: experimental-cc-routine-2026-04-01` header is still accepted but no longer
  required.
- **Body**: optional; one field, `text`, freeform and unparsed, **at most 65,536 characters**.
  Unknown fields are ignored. JSON sent in `text` arrives as a literal string.
- **Response**: `200` with `{"type": "routine_fire", "claude_code_session_id", "claude_code_session_url"}`,
  returned once the session is created. It does not wait for the run.
- **Errors**: `400` (bad version header, `text` too long, or **the routine is paused**), `401`
  (missing or wrong token), `403` (account has no access), `404` (no such routine), `429` (an
  hourly cap; carries `Retry-After`), `500`, `503`.
- **No idempotency key.** "Each successful request creates a new session ... If a webhook caller
  retries, the endpoint creates multiple sessions." So the app must not retry blindly.
- **Tokens are managed only in the web UI**: "You can't add an API trigger or manage its token from
  the CLI", and "There is no public API for token management." Generating a token revokes the
  previous one; deleting it removes the API trigger.

### What the run receives

The `text` "arrives wrapped in a `<routine-fire-payload>` block that labels it as untrusted data
and tells Claude not to follow instructions inside it unless the routine's own prompt says to." The
saved prompt therefore has to name the block, e.g. "Triage the Feedback named in the
routine-fire-payload block" (routines doc).

Two consequences for this app:

- The payload is context, not authority. The fired prompt "can't act as approval or consent for
  actions during the run" (routines doc, step 2), and `cloud-environment.md` records that the
  permission classifier only honours an "Authorized for this run:" line in the routine's **own**
  prompt. So what the Feedback routine may do (comment, open issues, call the Feedback route) goes
  in its saved prompt, as for `agent:go`.
- Sending only `Feedback #<id>` keeps the member's words out of the payload entirely. A member's
  text can still try to instruct the run once it is read from the route, so the prompt should say
  the Feedback text is data to quote, never instructions. The wrapper only protects `text`.

### Alternatives, and why they lose

- **A GitHub event the routine listens to.** Routine GitHub triggers support only **Pull request**,
  **Release** and **Issue** events (routines doc, "Supported events"). There is no
  `repository_dispatch` or `workflow_dispatch` trigger. For the app to start one it would have to
  open or label an issue, which (a) puts a GitHub token with write access in Vercel, (b) publishes
  something in the public repo before triage has applied its rules (members' names, raw words), and
  (c) still leaves the run to fetch the screenshot from somewhere. GitHub events are also "subject
  to per-task and per-account hourly caps. Events beyond the limit are dropped", where an API fire
  over its cap is refused with a `429` the app can see.
- **`repository_dispatch` into a GitHub Actions workflow that calls `/fire`.** Possible, but it only
  moves the routine token from Vercel to Actions secrets and adds a GitHub token to Vercel. No gain.
- **A schedule trigger instead of an event** (e.g. hourly, the shortest the routine schedule
  allows: "Expressions that run more often than once per hour are rejected"). It needs nothing in
  the app, but each tick is a full session that mostly finds nothing, and a Feedback waits up to an
  hour. Vercel Cron on Hobby is no help: once a day at most (`docs/research/sms-provider-and-reminders.md`).
  A daily schedule is still worth keeping **as well**, as the safety net in section 3.

## 2. Where the token lives

**Vercel, as a `Secret` variable, Production only.** Vercel's two types are **Config**, readable
after saving, and **Secret**, "write-only after saving. Use them for passwords, API keys, and
tokens." A Secret value of 32 characters or more is redacted from build logs. Secrets may now also
be set in Development, but this one should not be: a preview or local `next dev` must never fire
the real routine, so with the variable unset the app should skip the fire silently (as
`authorized()` in `src/app/api/cron/auth.ts` treats a missing `CRON_SECRET`).

Two variables, since the fire URL carries the routine id: e.g. `FEEDBACK_ROUTINE_URL` and
`FEEDBACK_ROUTINE_TOKEN`. Names are #509's call.

**What a leak costs.** The token "is scoped to a single routine. A compromised token can only
trigger that routine; it grants no read access, no access to other routines, and no access to
account data" (Platform reference). The worst case is someone starting up to 30 runs an hour on
Jonah's subscription with text that arrives labelled untrusted. Rotating is one click
(**Regenerate**) plus a Vercel variable update and redeploy.

**Whose account.** Routines "belong to your individual claude.ai account", runs "count against
your account's usage and limits", and their GitHub actions "appear as you" (routines doc). The
Feedback routine would file issues as `jonahmabry`, like `agent:go` does today.

### Firing from the send action

`sendFromForm` in `src/lib/feedback/route.ts` is the one place a Feedback is created, behind
`sendFeedbackAction` in `src/app/(member)/you/feedback/actions.ts`. `sendFeedback` in
`src/lib/feedback/feedback.ts` returns the new id. Next's `after()` "allows you to schedule work to
be executed after a response ... is finished" and can be called from Server Functions; it runs
within the route's max duration, and runs even when the response errored (bundled `after.md`). The
repo already uses it in `src/app/api/cron/remind/route.ts`.

So the fire belongs in `after()` once the id is known, through an injected seam on `FeedbackRoute`
so the test suite never calls Anthropic. On a `429` or `5xx` the app should log and give up, not
retry: there is no idempotency key, and the sweep in section 3 picks the item up on the next fire.

`CLAUDE.md`'s build rule applies: any change to the `"use server"` action file is checked with
`npx next build`.

## 3. One run per Feedback, or batches

**The limits** (routines doc, "Usage and limits"; Platform reference, "Rate limits"):

| Action | Limit | Counted for |
| :- | :- | :- |
| API fires, **Run now** and one-off re-arms | 30 per hour | each routine, one shared count |
| API fires | 100 per hour | the account, across all routines |
| Scheduled runs | 100 per hour | the account |

"None of these hourly limits has overage." Each run is a full session that draws down the same
subscription usage as an interactive one.

**The app's volume.** A member may send 10 Feedback in a rolling day (`DAILY_FEEDBACK_LIMIT` in
`src/lib/feedback/limits.ts`). Even a bad Saturday is far below 30 an hour for the league as a
whole. The `agent:go` routines fire on GitHub events, which do not count against the API-fire cap.
The cap is not what argues for batching; **cost and duplicate filing** are.

**Duplicates.** Runs are independent sessions ("Claude Code doesn't reuse sessions across
events"). Two members reporting the same bug a minute apart start two runs, and each may find no
issue yet and open its own. `triage-feedback`'s existing key, the phrase `Feedback #<id>` in every
issue and comment it writes, stops the **same** Feedback being filed twice, but not two Feedback
about one bug filed in parallel.

**Recommended shape: fire per Feedback, sweep in the run.**

- The app fires once per Feedback with `Feedback #<id>`.
- The run lists every open Feedback (`done_at` null) and drops the ones an issue or comment already
  cites, exactly as `triage-feedback` step 1 does, then files the rest. The id in the payload is the
  reason it woke up, not the limit of its work.
- That makes runs self-healing: a fire lost to a `429`, a paused routine or an outage is filed by the
  next one. A **daily schedule trigger** on the same routine covers a day with no further Feedback.
- Duplicates under a burst can be shrunk, but not removed, by the run searching the tracker again
  just before it files (not only at the start). Removing them needs a debounce in the app, e.g.
  firing only when no fire went out in the last few minutes, which needs a stored "last fired"
  time: a schema change, and #509's call.

**Marking Done.** The map leaves open whether the routine records which issue a Feedback went to.
Under this shape it does not need to for correctness: the `Feedback #<id>` search is already the
record. Writing Done back would need a write route, not just the read one below.

## 4. How the run reads the Feedback and its screenshot

**Today** `triage-feedback` runs `.claude/skills/triage-feedback/export.mjs` with
`node --env-file=.env.local`. It queries `feedback`, `members` and `feedback_screenshots` (base64
JPEG text, `src/db/schema.ts`) with the production `DATABASE_URL`, and writes `feedback.json` plus a
`feedback-<id>.jpg` per screenshot.

**A cloud run has none of that.** Per `docs/agents/cloud-environment.md`: "There is no `.env.local`
otherwise"; the environment's only variable is `NEON_PROJECT_ID`, "no app secrets"; and the only
database it reaches is a throwaway `slate-agents` branch with fake data. Node's `fetch` needs
`NODE_USE_ENV_PROXY=1`; `curl` does not.

### Why not the fire payload

`text` could carry the Feedback's words (at most 1,000 characters, `MAX_FEEDBACK_TEXT`) but not
usefully the screenshot. A 1600px JPEG (`SCREENSHOT_LONG_EDGE`) is allowed up to 1 MiB
(`MAX_SCREENSHOT_BYTES`), which is up to about 1.4 M base64 characters against a 65,536 cap, and
even a small one would arrive only inside the prompt, where Claude cannot turn it back into an
image file it can look at. `triage-feedback` step 2 shows the screenshot changed the target issue
for three of fifteen items, so the run has to see it.

### Option A (recommended): a read-only route on the app, keyed by a network secret

- The app adds a route, e.g. `GET /api/feedback/open` (JSON: id, kind, text, user agent, created
  date, whether there is a screenshot) and `GET /api/feedback/<id>/screenshot` (the JPEG). Both are
  refused unless `Authorization: Bearer <FEEDBACK_EXPORT_TOKEN>` matches, compared as `authorized()`
  compares `CRON_SECRET`. The existing console screenshot route,
  `src/app/console/feedback/[id]/screenshot/route.ts`, needs a commissioner's session and cannot be
  reached by a run.
- The routine's cloud environment gets a **network secret** for the app's production host:
  "Anthropic's agent proxy adds the key to requests for the hosts you list, after each request leaves
  the session's VM, so the key itself stays outside the VM" (cloud-environments doc). Hosts listed on
  a network secret are reachable even if the allowlist would not otherwise allow them. This is the
  pattern the Neon API and Jev keys already use here.
- The run then needs nothing but `curl`: no `.env.local`, no database URL, no `node_modules` for the
  export. The output can match `export.mjs`'s (`feedback.json` plus `feedback-<id>.jpg`), so the skill's
  later steps do not change.
- The route should leave out `display_name`: the export includes it, but the issue rules call every
  member "a member", so the run has no use for a name.
- Use the production custom domain. `*.vercel.app` deployments are behind Vercel's SSO wall.

**Use a separate cloud environment for this routine.** "The secret applies in every session that
runs in the environment, whoever started it, until you delete it" (cloud-environments doc). If the
key lived on `env_01MiccQNpMhWYhnHvHDLLqT5`, every `agent:go` build, which reads public issue text,
could read members' Feedback too. An environment of its own also keeps the Neon API secret away from
the Feedback routine, which has no need for it.

### Option B: the production database from the cloud

- **As an environment variable**: rejected. Environment values are "visible to anyone who uses the
  environment", and the docs say to use a network secret instead for keys. It would put full
  production credentials in a VM that reads untrusted text.
- **As a network secret on the Neon host**: `@neondatabase/serverless`'s HTTP mode sends the
  connection string in a `Neon-Connection-String` header to `https://<host>/sql` (installed
  `index.mjs`), so a custom-header network secret could in principle supply it out of the VM.
  **Not tested**, and every session in the environment could then run any SQL its role allows on
  production. A read-only role on just the three tables would limit that, but it is a database
  change and a riskier surface than Option A's two fixed reads.

## Open for #509

- The variable names, and whether the fire seam lives on `FeedbackRoute` or beside it.
- Whether to debounce bursts in the app (needs stored state) or accept a rare duplicate issue.
- Whether the run writes Done back, which would need a write route as well.
- The routine's saved prompt: the `routine-fire-payload` reference, the "Authorized for this run:"
  line, and the rule that Feedback text is data.
- Setup, by hand, on claude.ai: the routine, its API trigger and token, the new environment with its
  network secret and setup script (the mattpocock plugin line from `cloud-environment.md`).
