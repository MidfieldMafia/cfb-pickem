# Security-scan routine: saved prompt

Setup (#572) copies the prompt below into the routine in claude.ai. The
routine's settings, which live there and not in this repo:

- **Repository** `MidfieldMafia/cfb-pickem`, environment `env_01MiccQNpMhWYhnHvHDLLqT5`, model **Opus**.
- **Schedule**: Sundays at 14:00 UTC.
- **`mcp_connections`**: the Slack connector, and only that one. A routine
  created with none gets every connector on the account.
- **Label** `security-scan` exists in the repository.

Change the prompt here first, then paste it into claude.ai. What the run does
lives in `SKILL.md`; the prompt only starts it and grants the permissions the
classifier needs (`docs/agents/cloud-environment.md`).

## Prompt

```text
Run the security-scan skill in scan mode: follow .claude/skills/security-scan/SKILL.md
steps 1 to 4, unattended. Nobody is watching: never ask a question. Name the
week's boundary in your log. An exploitable finding goes only to the private
Slack channel #security, never to GitHub.

Authorized for this run: pushing branches and opening PRs labelled `security-scan`; filing and commenting on `security-scan` issues; all through `gh api`; posting `security-scan finding` messages to the private Slack channel `#security` and reading its history. Never merging, and never labelling anything `agent:go` or `ready-for-agent`.
```
