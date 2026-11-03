# Can the cloud routine upload screenshots with `gh --attach`?

Research date: 2026-11-02. Resolves [#534](https://github.com/MidfieldMafia/cfb-pickem/issues/534),
the cloud follow-up to [#512](https://github.com/MidfieldMafia/cfb-pickem/issues/512)
(`docs/research/pr-screenshots.md` on branch `research/pr-screenshots`).

**Answer: no.** A Claude Code cloud session cannot upload to GitHub user-attachments, by
`gh --attach` or by calling the endpoint directly. Three separate things stop it, and fixing any one
still leaves the others. None of the three is under this repo's control, so the agent:go routine
keeps committing screenshots to the `agent-screenshots` branch.

| | What blocks it | Evidence |
|---|---|---|
| 1 | The cloud image's `gh` is **2.89.0**, older than the 2.99 that added `--attach` | Probe step 1 and step 4: `unknown flag: --attach` |
| 2 | `gh issue` and `gh pr` use **GraphQL**, which the GitHub proxy refuses with a 403 whatever the credential. A newer `gh` would fail before it uploaded anything | Anthropic's docs ([GitHub proxy](https://code.claude.com/docs/en/cloud-environments.md#github-proxy)); probe step 3 |
| 3 | The proxy **refuses the upload body itself**: a binary POST to `uploads.github.com` gets `415`, and nothing reaches GitHub | Probe step 5; local control request (§3) |

The two unknowns #512 left are answered like this:

- **Is `uploads.github.com` reachable?** Partly. The request is not refused at the network
  layer: `curl https://uploads.github.com/` from the VM got an HTTP answer with no `CONNECT` error,
  although the host is not on Anthropic's default allowlist. But GitHub does not answer it. The
  session's GitHub proxy does, and it forwards only JSON request bodies (§3).
- **Does the endpoint accept the proxy's credential?** Still unknown, and now moot. The request
  never reached GitHub, so GitHub never saw a credential. Whatever GitHub's answer would be, the
  proxy stops the request first.

## Sources

- The one-off cloud probe run for this ticket: session `session_01NzP3quwZNu2H1ybLZ8KMyQ`, reporting at
  2026-11-03 00:20 UTC, started with `claude --cloud` (CLI 2.1.316), asking for environment
  `env_01MiccQNpMhWYhnHvHDLLqT5` (the routines' environment) through
  `--settings '{"remote":{"defaultEnvironmentId":…}}'`. Its report is
  [the comment on #534](https://github.com/MidfieldMafia/cfb-pickem/issues/534#issuecomment-6591962478).
  The session did not print its environment id, so the run does not prove which environment it got.
  No finding depends on it: the `gh` version comes from the image, and the GraphQL and body rules
  belong to the GitHub proxy, which runs "independent of the environment's access level"
  (Anthropic, below).
- Anthropic, [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments.md):
  sections *GitHub proxy*, *Work with GitHub issues and pull requests*, *Default allowed domains*.
- Anthropic, [Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web):
  *GitHub authentication options*.
- `cli/cli` at `v2.103.3`, `internal/attachments/client.go` and `doc.go`.
- A control request from a local Mac with no credential (§3).

**Uploaded:** nothing. The probe's one allowed upload, a 1x1 blank PNG, was refused before it
reached GitHub (step 5), so there is no stranded asset. The probe posted one comment, its report.

## 1. The cloud's `gh` has no `--attach`

The probe ran `gh --version` and got `gh version 2.89.0 (2026-03-26)`. `--attach` arrived in 2.99.0
(GitHub changelog, 2026-09-01, cited in #512's research). `gh issue comment 534 --attach blank.png`
exited 1 with `unknown flag: --attach`, so nothing was uploaded or posted.

Anthropic lists `gh` among the pre-installed tools without a version
([Installed tools](https://code.claude.com/docs/en/cloud-environments.md#installed-tools)). A setup
script could install a newer one, but §2 makes that pointless.

## 2. `gh issue` and `gh pr` are refused: GraphQL

Anthropic's GitHub proxy section:

> **GraphQL restrictions**: the proxy rejects requests to GitHub's GraphQL endpoint with a 403 whose
> message starts with `GitHub GraphQL is not available from Claude Code sessions` … `gh` subcommands
> that use GraphQL, such as `gh pr` and `gh issue`, get the same 403. The restriction applies to
> every request through the proxy regardless of the credentials you supply, so a `GH_TOKEN` you set
> gets the same 403.

The probe confirmed it. `gh issue view 534 --json title` and `gh api graphql -f query='{viewer{login}}'`
both exited 1 with HTTP 403: `GitHub GraphQL is not available from Claude Code sessions; use the
REST API (gh api repos/{owner}/{repo}/...)`.

`--attach` exists only on `gh issue|pr create|edit|comment`, and those commands look up the issue or
PR, the repository id and `viewerPermission` through GraphQL before uploading. `doc.go` requires the
uploader to be built before any prompt, from "the lookup the command already makes". So with any
`gh` version, `--attach` in a cloud session fails at that lookup, before the upload.

That leaves the endpoint itself, called through `gh api`, which goes over REST.

## 3. The raw upload is refused by the proxy

`gh` 2.103.3 uploads with `POST https://uploads.github.com/user-attachments/assets?name=…&content_type=…&repository_id=…`,
the file as the body, `Content-Type: application/octet-stream` (`client.go`, `postAsset`). The probe
sent exactly that with `gh api` (repository id `1357620669`, the 70-byte PNG,
`$GH_TOKEN` = `proxy-injected`, so the proxy supplies the credential):

```
HTTP/1.1 415 Unsupported Media Type
{"message":"Request bodies must declare Content-Type: application/json. Resend the JSON body with that header."}
```

No asset was created.

**The proxy sent that answer, not GitHub.** The same requests from a local Mac, outside the proxy:

| Request | Cloud VM (through the proxy) | Local, direct to GitHub |
|---|---|---|
| `GET https://uploads.github.com/`, no credential | `400` | `302` |
| `POST …/user-attachments/assets`, octet-stream PNG body | `415`, the message above (proxy's credential) | `400`, `{"message":"You have sent an invalid request. Please do not send this request again.", "request_id": …, "documentation_url": "https://developer.github.com/v3/"}` (no credential) |

GitHub's errors carry a `request_id` and `documentation_url`. The 415 carries neither, and it gives
an instruction about the body that GitHub's own endpoint does not follow: the endpoint takes a
binary body. The local control was sent with no credential, so it could not create an asset. So
the GitHub proxy intercepts `uploads.github.com` along with the other GitHub hosts. It is documented
as handling "all GitHub operations", which explains why the host answers even though it is missing
from the default allowlist. And it forwards only JSON bodies. An image upload is not JSON, so it
never leaves the proxy.

This is inferred from the response shapes; Anthropic's docs do not state the JSON-only rule. It is
the reading that fits both columns.

**A token of our own would not get around it.** Setting `GH_TOKEN` to a PAT on the environment
passes the token into the VM unchanged (Anthropic, *Work with GitHub issues and pull requests*), but
requests still go out through the proxy. The GraphQL rule applies "regardless of the credentials you
supply". Whether the body rule does is untested, and testing it would mean putting a long-lived
write token in an environment variable that "anyone who uses the environment can read" (same
section). That is the exposure the proxy exists to prevent. It is not worth trying for screenshots.

## 4. What it means for agent:go

- **Keep the `agent-screenshots` branch.** `scripts/agent-shots.ts` uses `git push`, which goes
  through the proxy's git path and works (nine routine runs, #512 §1). Nothing in the routine
  changes.
- **For the routine to move to user-attachments,** all three blockers would have to go away. The
  cloud image would need `gh` ≥ 2.99 (a setup script can install one). The proxy would have to
  allow GraphQL, or `agent-shots` would have to skip `gh --attach` and call the endpoint with
  `gh api`. And the proxy would have to forward a binary body to `uploads.github.com`. The last two
  are Anthropic's proxy rules, so they cannot be changed from this repo. Re-run this probe if
  Anthropic's GitHub proxy docs change.
- **Local sessions are unaffected.** #512's recommendation for them (`gh pr … --attach`, fake-league
  data only) still stands, since the local `gh` talks to GitHub directly.
- **Side findings for `docs/agents/cloud-environment.md`:** the cloud `gh` is 2.89.0, and
  `gh issue …`/`gh pr …` fail there with the GraphQL 403. Only `gh api` with REST paths works. The
  file says "`gh api` works" but does not say that the higher-level subcommands do not.

## Re-running the probe

The prompt is the seven steps reported in the comment on #534: write the PNG, check `gh --version`
and `$GH_TOKEN`, `curl` both hosts, try GraphQL, try `gh issue comment --attach`, try the raw
`gh api` upload, then post one REST report comment. Start it with
`claude --settings '{"remote":{"defaultEnvironmentId":"<routine env id>"}}' --cloud "<prompt>"`.
`--cloud` refuses to run without a TTY, so a non-interactive caller wraps it in
`script -q <log> claude …`. Its prompt must authorize the single upload and the comments, or the
permission classifier may refuse them. Upload only a blank image: an upload that succeeds cannot be
undone.
