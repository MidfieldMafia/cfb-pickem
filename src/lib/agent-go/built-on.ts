/**
 * The `Built on:` evidence line of an agent:go PR (`.claude/skills/agent-go/SKILL.md`,
 * step 7). The build subagent writes its own leg and the minutes; the orchestrator
 * rewrites the line to the whole format with `npm run agent-built-on`. The rules
 * are here so the format is the same on every PR the changelog and the level
 * retuning read.
 */
import type { Route } from "./route";

/** `640`, `65k`, `1.2k`, `1.9M`. */
export function formatTokens(n: number): string {
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  if (n < 1000) return String(n);
  if (n < 1_000_000) return n >= 100_000 ? `${Math.round(n / 1000)}k` : `${trim(n / 1000)}k`;
  return `${trim(n / 1_000_000)}M`;
}

/**
 * What Jev answered and how the call went, for retuning the levels (#516):
 * `levels 0.1/0.1/0.15/0.25/0.4, jev-1.14.0, HTTP 200 in 2.3 s`, with
 * `after 2 tries` when it was retried. Each part only when it is known.
 */
function jevLog(route: Route): string {
  const parts: string[] = [];
  if (route.probabilities) parts.push(`levels ${route.probabilities.map((p) => String(Number(p.toFixed(2)))).join("/")}`);
  if (route.jevModel) parts.push(route.jevModel);
  if (route.call) {
    const { status, ms, attempts } = route.call;
    const seconds = (ms / 1000).toFixed(1).replace(/\.0$/, "");
    const tries = attempts > 1 ? ` after ${attempts} tries` : "";
    parts.push(`${status === null ? "no reply" : `HTTP ${status}`} in ${seconds} s${tries}`);
  }
  return parts.map((part) => `, ${part}`).join("");
}

/** `Jev level 5, confidence 0.4, 1.1k tokens, below 0.7 so level 4, levels …, jev-1.14.0, HTTP 200 in 2.3 s`, or the error. */
export function jevPart(route: Route): string {
  if (route.reason === "jev-error" || !route.jev) {
    return `Jev error: ${route.error ?? "unknown"}, routine default${jevLog(route)}`;
  }
  const { level, confidence, inputTokens, outputTokens } = route.jev;
  const base = `Jev level ${level}, confidence ${confidence}, ${formatTokens(inputTokens + outputTokens)} tokens`;
  return `${route.reason === "low-confidence" ? `${base}, below 0.7 so level 4` : base}${jevLog(route)}`;
}

const LINE = /^Built on:.*$/m;

/**
 * The whole line, from the one the subagent wrote. Its legs and minutes stay;
 * `legs` replaces the legs for a run that had two.
 */
export function builtOnLine(input: {
  existing: string;
  route: Route;
  tokens: number;
  tools: number;
  legs?: string;
}): string {
  const found = LINE.exec(input.existing);
  if (!found) throw new Error("the PR body has no `Built on:` line to rewrite");
  const legs = input.legs ?? /^Built on: (.*?)(?: \(| ·|$)/.exec(found[0])?.[1];
  const minutes = /(\d+) min claim→PR/.exec(found[0])?.[1];
  if (!legs || !minutes) throw new Error(`could not read the legs and minutes from: ${found[0]}`);
  return (
    `Built on: ${legs} (${jevPart(input.route)}) · build ${formatTokens(input.tokens)} tokens, ` +
    `${input.tools} tool calls, orchestrator not counted · ${minutes} min claim→PR`
  );
}

/** The PR body with only its `Built on:` line replaced. */
export function replaceBuiltOn(body: string, line: string): string {
  return body.replace(LINE, () => line);
}
