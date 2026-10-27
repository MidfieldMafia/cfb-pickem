# Why Jev's answers come back "empty" in agent:go

Research for #507 (map #492), 2026-10-26. No call was made to Jev for this:
everything below comes from TypeSafe's published docs, the repo's code, and the
`Built on:` lines and issue comments the routine left behind.

## Summary

The "empty" answers are most likely **not empty**. They are well-formed Jev
answers whose `confidence` is exactly `0`, and TypeSafe documents `0` as an
ordinary value: its Score confidence is *floored* at 0 whenever the
probabilities are at least as spread out as an even spread. On a five-level
Score whose most probable level is the top one (level 5), almost any spread-out
distribution lands on exactly 0. PR #485 made `route()` treat `confidence <= 0`
as "Jev's answer was empty", so since then a legitimate "I'm not sure, leaning
level 5" answer is reported as a Jev error and builds on the routine default
(Sonnet medium) instead of the level-4 Opus build the confidence floor exists
to give an unsure answer.

What it is **not**: the message "Jev's answer was empty" is produced only after
a 200 with a JSON body that has `answers.difficulty`, a numeric `confidence`
and numeric probabilities for all five levels. A missing or wrong network
secret, a proxy error page, a timeout, a 429 or a 529 all produce *other*
messages. So the proxy, rate limits and timeouts are ruled out for these runs.

Nobody has seen a raw response for one of these runs: `agent-route` saves only
the route, not Jev's body, and the routine's session transcripts are not on
this machine. The fix below therefore starts with logging the body.

## Evidence: every `Built on:` line so far

From the bodies of the last 40 PRs (`gh pr list --state all --limit 40`), plus
the "Build started" comments on the issues:

| PR (issue) | Date | Jev part of `Built on:` |
|---|---|---|
| #469 | 10-24 | level 5, **confidence 0**, 1.6k tokens, below 0.7 so level 4 |
| #470 | 10-24 | level 5, confidence 0.68, 3.2k tokens, below 0.7 so level 4 |
| #471 | 10-24 | level 5, confidence 0.65, 2.2k tokens, below 0.7 so level 4 |
| #478 | 10-26 | level 5, confidence 0.46, 1.8k tokens, below 0.7 so level 4 |
| #483 (#481) | 10-26 | level 5, **confidence 0**, 1.1k tokens (17 output), below 0.7 so level 4 |
| #486 (#482) | 10-26 | error: `agent-route` failed to run (`tsx: not found`) |
| #487 | 10-26 | level 4, confidence 0.7, 3.1k tokens |
| #490 (#489) | 10-26 | **error: Jev's answer was empty** |

Plus the #465 probe (`docs/agents/cloud-environment.md`): level 4, confidence
0.67, 1,573 input tokens. #466 and #467 predate routing.

Counts over the eight routed runs: **one** answer at or above the 0.7 floor
(#487), four below it with real confidence, **three with confidence 0**
(#469, #481, #489), and one run where `agent-route` never started (#482, fixed
by the `npm ci` step in PR #485). No run has failed on HTTP, the key, the proxy
or a timeout.

Every non-zero answer before #487 leaned to level 5, with confidence falling
from 0.68 to 0.46. The two pre-#485 confidence-0 answers also came out as level
5. That is the pattern expected from a spread distribution leaning to level 5,
not from an absent one (see below).

## What TypeSafe documents

- **Response shape.** `POST /v1/systemone` answers 200 with
  `{ model, answers, usage }`, all required; `answers` is keyed by the question
  names sent. A Score answer is `{ type: "score", score, confidence, legend,
  probabilities }`, with `probabilities` and `legend` keyed by level number as a
  string, from `"0"`
  ([API reference](https://docs.typesafe.ai/api/system-one.md),
  [Score](https://docs.typesafe.ai/primitives/score.md#response-structure)).
  `route.ts` reads exactly these names: `answers.difficulty.probabilities["0"…"4"]`,
  `confidence`, `usage.input_tokens`/`output_tokens`. No field-name mismatch.
- **Probabilities sum to 1** ("The sum of all values is 1",
  [Score](https://docs.typesafe.ai/primitives/score.md#response-structure)).
  An all-zero answer is not a documented response.
- **Confidence 0 is documented and normal.** For a Score with *n* levels and
  most probable level *m*:
  `confidence = max(0, 1 − Σ pᵢ·|i − m| / MAD_unif)`, with
  `MAD_unif = (1/n)·Σ|i − (n−1)/2|`, which is 1.2 for five levels. It "is
  floored at 0 when the answer is at least as spread out as an even spread"
  ([Confidence](https://docs.typesafe.ai/confidence.md#score)). The docs call
  low confidence the model's "I'm not sure" signal and recommend routing on it
  ([Confidence](https://docs.typesafe.ai/confidence.md),
  [Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing.md)).
- **No streaming or 202.** The only documented success is a 200 with JSON; no
  async or chunked mode exists for this endpoint
  ([API reference](https://docs.typesafe.ai/api/system-one.md)).
- **Errors.** 400 (request rules, or `max_tokens_exceeded` over the context
  length), 401 (missing or invalid key), 413, 415, 422 (validation), 429 (rate
  limit), 529 (overloaded), each with a JSON `detail`
  ([Request rules and errors](https://docs.typesafe.ai/api/errors.md)). The
  repo's note that a keyless request gets 403 off the cloud is observed, not
  documented.
- **Rate limits and retry.** Per organization, in tokens and requests per
  second; over either is 429. 429 and 529 should be retried with exponential
  backoff, honouring `retry-after` when sent; the SDKs do this by default
  ([Models: Rate limits](https://docs.typesafe.ai/models.md#rate-limits),
  [errors](https://docs.typesafe.ai/api/errors.md#handling-rate-limits)).
- **Timeouts.** TypeSafe documents no server-side timeout for the endpoint.
  `agent-route` aborts at 60 s; an abort surfaces as the abort error's message,
  not as "empty".
- **Context.** `jev-1.14.0` (what `jev-latest` points to since 2026-10-14) takes
  64k tokens per request and 32k per question
  ([Models](https://docs.typesafe.ai/models.md)). The routed requests used
  1.1k–3.2k. Over the limit is a 400, not a degraded answer.
- **Model drift.** `jev-latest` is an alias that moves on release, "so its
  answers can change without any change to your code"; TypeSafe advises pinning
  the versioned ID once thresholds are tuned against one
  ([Models: Aliases](https://docs.typesafe.ai/models.md#aliases)).

## How `agent-route` reaches "empty"

`scripts/agent-route.ts` → `route()` in `src/lib/agent-go/route.ts`:

| Response | Message in `Built on:` |
|---|---|
| fetch throws (DNS, proxy CONNECT refused, 60 s abort) | the exception's message |
| 401/403 and no `TYPESAFE_API_KEY` | `HTTP 40x from Jev: no key reached it …` |
| any other non-2xx (400, 422, 429, 529, a proxy's 5xx page) | `HTTP <status> from Jev` |
| 2xx, body not JSON (an HTML page with status 200) | `Jev's answer could not be read` (`.json()` → `null`) |
| JSON without `answers.difficulty.{probabilities, confidence:number}` | `Jev's answer could not be read` |
| a level's probability not a number | `Jev's answer did not score five levels` |
| **`confidence <= 0`, or every probability 0** | **`Jev's answer was empty`** |

So "empty" is reachable only from a well-formed Score answer. **Confirmed (by
the code):** #489's response was a 200 with a parseable Score answer, from Jev
itself, after the key had been applied; it was not the proxy, the network
secret, the request shape, a timeout or a rate limit.

The tie rule is also worth knowing: `scores.reduce(… p >= scores[best] …)`
gives ties to the harder level, so an all-zero answer and an exactly uniform
one both come out as level 5, which is what #469 and #481 printed.

## Most likely cause

**Hypothesis (strong, not yet confirmed):** the three confidence-0 answers were
real, spread-out distributions leaning to level 5, and `confidence` was 0 by
TypeSafe's floor. With five levels and the peak on level 5, distances from the
peak run up to 4 while `MAD_unif` is 1.2, so modest mass on the low levels
zeroes it:

| Probabilities, levels 1–5 | Top | Confidence |
|---|---|---|
| 0.20, 0.20, 0.20, 0.20, 0.20 | 5 (tie rule) | 0 |
| 0.10, 0.10, 0.15, 0.25, 0.40 | 5 | 0 |
| 0.30, 0.10, 0.10, 0.10, 0.40 | 5 | 0 |
| 0.05, 0.05, 0.10, 0.30, 0.50 | 5 | 0.29 |
| 0.00, 0.00, 0.00, 0.50, 0.50 | 5 | 0.58 |

(computed with the formula above). That fits the run of level-5 answers at
falling confidence before it, and the cause of that lean: until PR #477 Jev was
told build tickets had no Agent Brief, which is level 5's first clause, while
the rest of each ticket pointed lower, a bimodal reading. #489 is the only
confidence-0 run after #477, so the lean may persist for other reasons; the
levels' own wording ("several of the level 4 risks at once", "the brief is
thin") overlaps enough to spread mass.

What supports it: 17 output tokens on #481, which PR #485 took as a sign of
emptiness, is the normal size of a Score answer (the docs' examples show 12 and
18). Input tokens (1.1k–1.6k) were in the normal range, so Jev read a full
state.

**Hypothesis (weak):** Jev genuinely returned every probability at 0. It is
undocumented, contradicts "sum of all values is 1", and nothing distinguishes
it from the uniform case in what was logged. It cannot be ruled out without a
raw body.

**Ruled out:** field-name mismatch, non-JSON body, streaming/202, proxy error
page, missing key, 429/529, timeout, context overflow. Each produces a different
message or none of these runs reached it.

## Recommended fix

1. **Stop calling confidence 0 empty.** In `route()`, keep the empty check only
   for probabilities that do not sum to roughly 1 (e.g. `Math.abs(sum − 1) >
   0.01`, which catches all-zero), and let `confidence` 0 fall to the existing
   `low-confidence` path: level 4, Opus medium, recorded as
   `Jev level 5, confidence 0, below 0.7 so level 4`. Fix the `route.test.ts`
   case that pairs `[0, 0, 0, 0, 1]` with confidence 0, a combination the
   formula cannot produce (all mass on one level is confidence 1).
2. **Keep the evidence.** Save the raw response (status, `model`, the whole
   `answers.difficulty`, `usage`, and elapsed ms) next to the route, e.g. in
   `/tmp/agent-go-route-<n>.json` under `jev.raw`, and have
   `agent-built-on` or the issue comment print the five probabilities. One run
   then settles which hypothesis holds, and the level retuning gets
   distributions rather than an argmax.
3. **Retry what TypeSafe says to retry.** One or two retries on 429 and 529
   (and on a thrown network error), with backoff and `retry-after` honoured,
   inside the 60 s budget. Do **not** retry an all-zero or confidence-0 answer:
   the docs treat low confidence as the answer itself, not a fault, so a
   re-ask would only fish for a different draw (whether repeated calls vary is
   not documented).
4. **Pin the model.** Send `jev-1.14.0` instead of `jev-latest`, since the 0.7
   floor and the levels are being tuned against observed answers, and the alias
   moved on 2026-10-14 in the middle of this data.
5. **Then retune the levels** (SKILL.md "Jev's question") with the logged
   distributions: if most mass keeps splitting between level 1–2 and level 5,
   the level texts are being read as two separate dimensions (brief quality vs
   risk), which the Score docs flag as a cause of low confidence ("the levels
   are ambiguous, multi-dimensional",
   [Confidence](https://docs.typesafe.ai/confidence.md)).

## Not reachable

The routine's session transcripts for #469, #481 and #489 run in the cloud and
are not in `~/.claude/projects` on this machine (`npm run sessions` reads only
local transcripts), so the actual HTTP status, body and timing of those calls
were not seen. The routine's run log (`RemoteTrigger` `get_run_log`) may hold
the `agent-route` JSON line, but it carries no probabilities either.
