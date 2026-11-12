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

/** `0.12`, `0.3`, `0`: two places, no trailing zeros. */
function num(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** A Score's probabilities, level 0 first: `0.6/0.4/0`. */
function spread(probabilities: number[]): string {
  return probabilities.map(num).join("/");
}

/**
 * How the call went (#516): `jev-1.14.0, HTTP 200 in 2.3 s`, with `after 2
 * tries` when it was retried. Each part only when it is known.
 */
function callLog(route: Route): string {
  const parts: string[] = [];
  if (route.jevModel) parts.push(route.jevModel);
  if (route.call) {
    const { status, ms, attempts } = route.call;
    const seconds = (ms / 1000).toFixed(1).replace(/\.0$/, "");
    const tries = attempts > 1 ? ` after ${attempts} tries` : "";
    parts.push(`${status === null ? "no reply" : `HTTP ${status}`} in ${seconds} s${tries}`);
  }
  return parts.map((part) => `, ${part}`).join("");
}

const RULE: Record<Exclude<Route["reason"], "jev-error">, string> = {
  base: "base",
  risk: "risk",
  "low-confidence": "low confidence",
};

/**
 * `Jev level 4 by risk, risk 0.82, open 0.4 at 0.7 (0.6/0.4/0), reach 1.1 at
 * 0.65 (0.1/0.7/0.2), 1.1k tokens, jev-1.14.0, HTTP 200 in 2.3 s` (#548), or
 * the error, each Score's probabilities when Jev scored it, and what is known
 * of the call. The questions are retuned from these.
 */
export function jevPart(route: Route): string {
  if (route.reason === "jev-error" || !route.jev) {
    const scored = (["open", "reach"] as const).flatMap((id) => {
      const probabilities = route.probabilities?.[id];
      return probabilities ? [`, ${id} ${spread(probabilities)}`] : [];
    });
    return `Jev error: ${route.error ?? "unknown"}, routine default${scored.join("")}${callLog(route)}`;
  }
  // The level the rules set, not `route.level`, which an escalated second leg has moved up.
  const { level, risk, open, reach, inputTokens, outputTokens } = route.jev;
  const score = (id: string, s: typeof open) => `${id} ${num(s.score)} at ${num(s.confidence)} (${spread(s.probabilities)})`;
  return (
    `Jev level ${level} by ${RULE[route.reason]}, risk ${num(risk)}, ${score("open", open)}, ${score("reach", reach)}, ` +
    `${formatTokens(inputTokens + outputTokens)} tokens${callLog(route)}`
  );
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
