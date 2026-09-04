# Issue tracker: GitHub

Issues, the roadmap, and specs for this repo live as GitHub issues in `MidfieldMafia/cfb-pickem`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,assignees`.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

## Ownership

Every ticket names its owner two ways: a GitHub assignee and a label.

- `owner:jonah` (assignee `jonahmabry`): logic, data, API, scoring, infrastructure.
- `owner:alex` (assignee `AlexMabry`): design, visual system, screen polish, brand assets.

## Roadmap (wayfinder)

- **Map**: the single issue labelled `wayfinder:map` titled "Saturday Slate roadmap". Every roadmap item is a GitHub **sub-issue** of it.
- **Child ticket**: added with the sub-issues API (`gh api --method POST repos/MidfieldMafia/cfb-pickem/issues/<map>/sub_issues -F sub_issue_id=<child-db-id>`). Labels: `wayfinder:<type>` for research/prototype/grilling/task tickets, `ready-for-agent` for build tickets.
- **Blocking**: GitHub native issue dependencies. `gh api --method POST repos/MidfieldMafia/cfb-pickem/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` where the id is the blocker's numeric database id (`gh api repos/.../issues/<n> --jq .id`).
- **Frontier**: open sub-issues of the map with no open blocker and no assignee-in-progress. Each ticket's body also lists "Blocked by" for readability.
- **Claim**: assign yourself and move it to in-progress by commenting; **resolve**: comment the answer, close, and append a one-line pointer to the map's "Decisions so far".

## Pull requests as a triage surface

**PRs as a request surface: no.**
