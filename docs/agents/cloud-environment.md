# The cloud environment

What a Claude Code cloud session (a routine run) can and cannot do here, and
the workaround for each gap. Every line was found by a run that failed on it,
October 2026. The routines (`agent:go`, the weekly changelog) run in cloud
environment `env_01MiccQNpMhWYhnHvHDLLqT5`; its settings are on claude.ai, not
in this repo.

## Set on the environment

- **Setup script** installs the mattpocock plugin. A cloud session never
  installs the plugins `.claude/settings.json` enables, and a session cannot
  install one itself: the permission classifier refuses it.
  ```bash
  claude plugin marketplace add mattpocock/skills
  claude plugin install mattpocock-skills@mattpocock --scope user
  ```
- **Network: Custom**, defaults included, plus `*.us-east-1.aws.neon.tech` for
  the `slate-agents` database branches.
- **Network secret** `Neon API (slate-agents)`: a project-scoped key, sent by
  the proxy to `console.neon.tech` under `/api/v2/projects/<slate-agents id>/`
  only. The key is never in the VM; call the API with plain `curl` or `fetch`.
  The project's own record (`/api/v2/projects/<id>`, no trailing slash) is
  outside that prefix, so it answers 403; nothing needs it.
- **Variable** `NEON_PROJECT_ID`. Nothing else: no CFBD key, no app secrets.
- **Owed for Jev (#463)**: variable `TYPESAFE_API_KEY` and `api.typesafe.ai`
  in the Custom allowlist. Neither was set on 2026-10-23; `agent-go` builds on
  the routine's default until both are.

## In a session

- **The permission classifier needs the prompt's say-so.** A routine runs in
  auto mode, and the classifier refuses `npm run agent-db -- up` as "Modify
  Shared Resources" unless the routine's own prompt authorizes it; a repo doc
  saying it is safe does not count. Each routine's prompt ends with what it
  is authorized to change. `agent:go: build the ticket`:
  > Authorized for this run: removing the `agent:go` label from, assigning,
  > and commenting on the issue that started it; sending that issue's title,
  > body, labels and brief comments to TypeSafe's Jev API
  > (`npm run agent-route`); handing the build to one subagent, and to a second
  > one level up if the first fails; pushing a branch, opening a PR and editing
  > its body; `npm run agent-db` may create, seed and delete throwaway branches
  > in the agent-only `slate-agents` Neon project (fake data, no production or
  > shared database); and `npm run agent-shots` may push screenshots to the
  > `agent-screenshots` branch.

  The build subagent gets the same sentence in its hand-off (`agent-go`
  step 2b): the classifier reads the prompt it was given.

  `agent:go: release queued tickets`:
  > Authorized for this run: removing and re-adding the `agent:go` label on
  > open issues whose blockers are all closed (this is what starts their
  > build), and commenting on those issues.

  The label and comment lines are precautionary: no run has been refused one
  yet. The `agent-db` line is not: a probe was refused without it.
- **Slash commands typed into a routine's prompt expand.** A skill with
  `disable-model-invocation` (`mattpocock-skills:implement`) loads only that
  way, so the prompt has to start with it.
- **Node's `fetch` ignores `HTTPS_PROXY`**, and the cloud reaches the internet
  only through it: `agent-db` restarts itself with `NODE_USE_ENV_PROXY=1`, and
  `next dev` or any other Node script that calls out needs it on its own
  command line. Each command runs in a fresh shell, so an `export` never
  reaches the next one. `curl`, `git` and `gh` need nothing.
- **`gh api` works**; `gh auth status` reports an invalid token regardless.
- **The database** is a throwaway `slate-agents` branch from
  `npm run agent-db` (`scripts/agent-db.ts`). There is no `.env.local`
  otherwise; build and tests need none.
- **Chromium** is at `/opt/pw-browsers/chromium`; downloading another is
  blocked. Its own calls to Google are refused, so a page never goes network
  idle: wait for `domcontentloaded` and a pause.
- **Screens that cannot render:** `/console/slate` calls CollegeFootballData
  as it renders, and there is no key. Member screens catch the same failure.
- **What covers a screenshot:** the What's new modal (a fresh browser has not
  seen the entry) and `next dev`'s badge. `.claude/skills/agent-go/shoot.cjs`
  clears both.

## Subagents and Jev

Three probe runs on 2026-10-23, for #465, which is what `agent-go` step 2b
rests on. The routine session ran on `claude-sonnet-5-5`.

- **The Agent tool takes `model` and `effort`**, and a subagent runs on the
  model asked for: `model: "opus"` answered `claude-opus-5-5`, `"sonnet"`
  answered `claude-sonnet-5-5`. Its parameters: `description`, `effort`,
  `isolation`, `model`, `prompt`, `run_in_background`, `subagent_type`.
- **`Agent` need not be in the routine's allowed tools.** The probe routine
  listed only Bash, Read, Write, Edit, Glob, Grep, WebFetch and WebSearch, and
  every call ran.
- **No session can tell its own effort.** The routine and both subagents said
  `effort unknown`, so the `Built on:` line records the effort the hand-off
  asked for.
- **A session cannot change its own model.** No tool does it, and a `/model`
  or `/effort` line it writes is only text: the model id was the same after.
- **Pass `run_in_background: false`.** A call that leaves it out can launch in
  the background, and the session's turn then ends (the run logs a `result`)
  before the subagent is done. In the foreground, the call returns
  `<usage>subagent_tokens: N tool_uses: M duration_ms: D</usage>` and the
  subagent's report arrives as a separate message after it. An empty subagent
  costs about 50k tokens.
- **A subagent has no Agent tool**, whatever its `subagent_type` (`claude`,
  `general-purpose` or none), so it cannot fan out: `code-review`'s two
  parallel axes run one after the other inside a build.
- **A subagent has the Skill tool.** `mattpocock-skills:code-review` loads;
  `mattpocock-skills:implement` is refused (`disable-model-invocation`), so
  the hand-off quotes its instructions.
- **Orchestrator and subagent share one machine**: a file one writes in
  `/tmp`, the other reads.
- **Jev was not reachable yet**: `TYPESAFE_API_KEY` was unset and the proxy
  refused `api.typesafe.ai` (`CONNECT tunnel failed, response 403`). Both are
  on #463's "Jonah does first" list; until then every build routes to the
  default with `"reason":"jev-error"`. From a laptop, a bad key answers
  `HTTP 401`, so the endpoint is right.

## Testing a routine

No probe routine is kept. To check the environment, create a disabled routine
with the `RemoteTrigger` tool, in this environment and on this repository,
whose prompt is the one `docs/agents/cloud-probe.md` gives; `run` it, read it
with `get_run_log`, and ask the user to delete it afterwards, since the tool
cannot.
