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

/** `Jev level 5, confidence 0.4, 1.1k tokens, below 0.7 so level 4`, or the error. */
export function jevPart(route: Route): string {
  if (route.reason === "jev-error" || !route.jev) return `Jev error: ${route.error ?? "unknown"}, routine default`;
  const { level, confidence, inputTokens, outputTokens } = route.jev;
  const base = `Jev level ${level}, confidence ${confidence}, ${formatTokens(inputTokens + outputTokens)} tokens`;
  return route.reason === "low-confidence" ? `${base}, below 0.7 so level 4` : base;
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
