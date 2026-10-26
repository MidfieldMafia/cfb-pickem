/**
 * Which model and effort an agent:go build runs on (#463). Jev, TypeSafe's
 * classifier, scores the ticket's difficulty on five levels and a table maps
 * each level to a tier. Both the levels Jev reads and that table live in
 * `.claude/skills/agent-go/SKILL.md`, where they are retuned, so this reads
 * them from there rather than keeping a copy.
 *
 * `npm run agent-route` (`scripts/agent-route.ts`) does the calling; this
 * holds the rules, which are what a wrong tier would be blamed on.
 */

export type Level = 1 | 2 | 3 | 4 | 5;

export interface Tier {
  level: Level;
  /** The Agent tool's `model`. */
  model: "sonnet" | "opus";
  /** The Agent tool's `effort`. */
  effort: "low" | "medium" | "high";
}

/** What Jev said, kept for the issue comment and the PR's `Built on:` line. */
export interface JevVerdict {
  /** The level Jev put the most probability on, before any rule moved it. */
  level: Level;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Route extends Tier {
  /** `jev`: Jev's level; `low-confidence`: moved to level 4; `jev-error`: the routine's default. */
  reason: "jev" | "low-confidence" | "jev-error";
  jev: JevVerdict | null;
  error?: string;
}

/** Below this, Jev's level is not trusted and the build runs at level 4. */
const CONFIDENCE_FLOOR = 0.7;
const UNSURE_LEVEL: Level = 4;
/** The routine's own setting, Sonnet medium, which is level 1's tier. */
const DEFAULT_LEVEL: Level = 1;
const QUESTION_ID = "difficulty";

/** The section of the skill that holds Jev's question, its levels and the table. */
function routingSection(skill: string): string {
  const heading = /^### Jev's question$/m.exec(skill);
  if (!heading) throw new Error("agent-go SKILL.md has no \"### Jev's question\" section");
  const rest = skill.slice(heading.index + heading[0].length);
  const end = rest.search(/^#{1,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Jev's question, its five levels easiest first, and the tier for each, from
 * the skill. A list item may wrap onto indented lines; they are joined.
 */
export function readSkill(skill: string): { question: string; levels: string[]; tiers: Tier[] } {
  const section = routingSection(skill);

  const question = /^Question: (.+)$/m.exec(section)?.[1]?.trim();
  if (!question) throw new Error("agent-go SKILL.md states no \"Question:\" for Jev");

  const levels: string[] = [];
  for (const line of section.split("\n")) {
    const item = /^([1-5])\. (.+)$/.exec(line);
    if (item) levels.push(item[2].trim());
    else if (/^ {3}\S/.test(line) && levels.length) levels[levels.length - 1] += ` ${line.trim()}`;
  }
  if (levels.length !== 5) throw new Error(`agent-go SKILL.md gives Jev ${levels.length} levels, not 5`);

  const tiers: Tier[] = [];
  for (const row of section.matchAll(/^\| ([1-5]) \| `(sonnet|opus)` \| `(low|medium|high)` \|/gm)) {
    tiers.push({ level: Number(row[1]) as Level, model: row[2] as Tier["model"], effort: row[3] as Tier["effort"] });
  }
  if (tiers.length !== 5 || tiers.some((tier, i) => tier.level !== i + 1)) {
    throw new Error(`agent-go SKILL.md's tier table has ${tiers.length} rows, not levels 1 to 5 in order`);
  }

  return { question, levels, tiers };
}

function tierAt(level: Level, tiers: readonly Tier[]): Tier {
  const tier = tiers.find((t) => t.level === level);
  if (!tier) throw new Error(`no tier for level ${level}`);
  return { level: tier.level, model: tier.model, effort: tier.effort };
}

/** A hard error (no key, network, non-200): build on the routine's default. */
export function routeOnError(error: string, tiers: readonly Tier[]): Route {
  return { ...tierAt(DEFAULT_LEVEL, tiers), reason: "jev-error", error, jev: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Jev's response to the difficulty question as a tier, or the default when it cannot be read. */
export function route(response: unknown, tiers: readonly Tier[]): Route {
  const answer = isRecord(response) && isRecord(response.answers) ? response.answers[QUESTION_ID] : undefined;
  const usage = isRecord(response) && isRecord(response.usage) ? response.usage : {};
  if (!isRecord(answer) || !isRecord(answer.probabilities) || typeof answer.confidence !== "number") {
    return routeOnError("Jev's answer could not be read", tiers);
  }

  // Levels are 0-based in Jev's answer. The most probable wins; a tie goes to the harder level.
  const probabilities = [0, 1, 2, 3, 4].map((i) => (answer.probabilities as Record<string, unknown>)[String(i)]);
  if (probabilities.some((p) => typeof p !== "number")) return routeOnError("Jev's answer did not score five levels", tiers);
  const scores = probabilities as number[];
  const top = scores.reduce((best, p, i) => (p >= scores[best] ? i : best), 0);

  const jev: JevVerdict = {
    level: (top + 1) as Level,
    confidence: answer.confidence,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
  };
  if (jev.confidence < CONFIDENCE_FLOOR) return { ...tierAt(UNSURE_LEVEL, tiers), reason: "low-confidence", jev };
  return { ...tierAt(jev.level, tiers), reason: "jev", jev };
}

/**
 * The one re-dispatch a failed build gets: a level up. Level 5 has none. The
 * reason and Jev's verdict stay as they were, since they explain the first
 * leg; the `Built on:` line marks the second as escalated.
 */
export function escalate(from: Route, tiers: readonly Tier[]): Route | null {
  if (from.level === 5) return null;
  return { ...from, ...tierAt((from.level + 1) as Level, tiers) };
}

const FILE_EXTENSIONS = /\.(tsx?|mts|cts|jsx?|mjs|cjs|md|json|sql|css|sh|ya?ml|html|svg)$/;

/** The files a brief names in backticks: paths with a slash, or a bare name with a code or doc extension. */
export function namedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const [, raw] of text.matchAll(/`([^`\s]+)`/g)) {
    const candidate = raw.replace(/:\d+(-\d+)?$/, "");
    // A URL, a flag, or an app route like `/picks`, which names a screen and not a file.
    if (/^[a-z]+:\/\//i.test(candidate) || /^[-/]/.test(candidate)) continue;
    if (!/^[\w.@/[\]()-]+$/.test(candidate)) continue;
    if (candidate.includes("/") || FILE_EXTENSIONS.test(candidate)) found.add(candidate);
  }
  return [...found];
}

export interface JevState {
  title: string;
  body: string;
  labels: string[];
  hasAgentBrief: boolean;
  /** Comments that are an Agent Brief or a spec. */
  briefComments: string[];
  /** The `wayfinder:map` issue it is a sub-issue of, by title. */
  parentMap: string | null;
  /** Every file the brief names, with its line count, or null for one that does not exist yet. */
  paths: { path: string; lines: number | null }[];
}

const BRIEF_HEADING = /^#{1,6}\s*Agent Brief\b/im;
const SPEC_HEADING = /^#{1,6}\s*Spec\b/im;
// `to-tickets` writes every build ticket as What to build, Acceptance and
// Blocked by, never under an Agent Brief heading. Missing it told Jev that
// each one had no brief, and level 5 opens with "No Agent Brief".
const BUILD_HEADING = /^#{1,6}\s*What to build\b/im;
const ACCEPTANCE_HEADING = /^#{1,6}\s*Acceptance\b/im;

/** An Agent Brief by name, or a `to-tickets` ticket: what to build and how to tell it is done. */
function isBrief(text: string): boolean {
  return BRIEF_HEADING.test(text) || (BUILD_HEADING.test(text) && ACCEPTANCE_HEADING.test(text));
}

/** The state Jev scores (#463 decision 5): the ticket and its brief, no file contents. */
export function jevState(input: {
  issue: { title: string; body: string; labels: string[] };
  comments: string[];
  parentMap: string | null;
  lineCount: (path: string) => number | null;
}): JevState {
  const { issue, comments, parentMap, lineCount } = input;
  const briefComments = comments.filter((c) => isBrief(c) || SPEC_HEADING.test(c));
  return {
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    hasAgentBrief: isBrief(issue.body) || briefComments.some(isBrief),
    briefComments,
    parentMap,
    paths: namedPaths([issue.body, ...briefComments].join("\n")).map((path) => ({ path, lines: lineCount(path) })),
  };
}

/** The request body for Jev's System One endpoint: one Score question on the skill's levels. */
export function jevRequest(state: JevState, question: string, levels: string[]) {
  return {
    model: "jev-latest",
    state,
    questions: { [QUESTION_ID]: { type: "score", instructions: question, criteria: levels } },
  };
}
