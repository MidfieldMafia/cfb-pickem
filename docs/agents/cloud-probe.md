# Cloud probe

A report-only run that checks the cloud environment
(`docs/agents/cloud-environment.md`) still does what the routines rely on. Its
prompt names this file and the checks to run, so the prompt stays one line and
the checks are versioned here:

```
Run the cloud probe in docs/agents/cloud-probe.md. Checks: all. <authorization line>
```

Checks 3–6 need the authorization line from `cloud-environment.md` in the
prompt itself; without it the permission classifier refuses check 3.

Firing it with the `RemoteTrigger` tool: `update` the prompt, wait for the
result, then `run`. Sent together, the run can start on the old prompt.
Read the result with `get_run_log`, which shortens long messages: the report
below puts its table first so a cut loses prose, not findings.

## Rules for the run

Change no files, commit nothing, open no PR or issue. The one push allowed is
`agent-shots` to `agent-screenshots` in check 6. Print no connection string,
key or cookie: lengths and status codes only. Run every check named even after
one fails, and run `npm run agent-db -- down` at the end whatever happened.

## Checks

1. **Plugin.** `claude plugin list` shows `mattpocock-skills` enabled, and
   `agent-go` and `agent-go-queue` are in your skills list.
2. **Install and build.** `npm ci`, then `npx next build`: exit codes and
   seconds.
3. **Neon.** `npm run agent-db -- up probe --live`, with no proxy variable set
   by you, exits 0 and prints the members.
4. **Signed in.** `NODE_USE_ENV_PROXY=1 npm run dev -- -p 3200` in the
   background; `npm run -s agent-db -- session Casey` prints a cookie;
   `/picks/review`, `/live` and `/leaderboard` answer 200 with it.
5. **Browser.** `node .claude/skills/agent-go/shoot.cjs --label after --out
   /tmp/shots /picks /live` exits 0 (it installs puppeteer-core if missing),
   and prints `/picks (landed on /picks/review)`, since `--live` locks Week 7.
   Run it in a new command without setting `S`: it reads the saved cookie. On
   `/live`, the Liberty game's newest play reads seconds or minutes ago.
   Read both PNGs and say in one sentence each what they show, whether
   anything covers the screen, and whether the bottom nav sits at the bottom.
6. **Publish.** `npm run agent-shots -- 9999 /tmp/shots` exits 0 and each
   printed image URL answers `200 image/png`.

## Report

First a table, one row per check: number, PASS or FAIL, one line of evidence
(the exact error on a FAIL). Then anything in `cloud-environment.md` that
proved wrong, quoted.
