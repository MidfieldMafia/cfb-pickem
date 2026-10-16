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

## In a session

- **Slash commands typed into a routine's prompt expand.** A skill with
  `disable-model-invocation` (`mattpocock-skills:implement`) loads only that
  way, so the prompt has to start with it.
- **Node's `fetch` ignores `HTTPS_PROXY`**, and the cloud reaches the internet
  only through it: `export NODE_USE_ENV_PROXY=1` before `agent-db`, `next dev`,
  or any script that calls out. `curl`, `git` and `gh` need nothing.
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

## Testing a routine

The disabled routine "agent:go smoke test (one-off)"
(`trig_01Jeu99ndzunY2cXy7tQbEr7`) is a probe: point its prompt at
`docs/agents/cloud-probe.md` and run it with the `RemoteTrigger` tool.
