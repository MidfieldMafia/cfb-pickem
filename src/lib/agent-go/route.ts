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

/** How the request to Jev went: its last HTTP status (null when none came back), the time it took and the tries. */
export interface JevCall {
  status: number | null;
  ms: number;
  attempts: number;
}

export interface Route extends Tier {
  /** `jev`: Jev's level; `low-confidence`: moved to level 4; `jev-error`: the routine's default. */
  reason: "jev" | "low-confidence" | "jev-error";
  jev: JevVerdict | null;
  error?: string;
  /**
   * Jev's five probabilities, level 1 first, whenever it scored all five, even
   * on an answer called empty: the levels are retuned from these (#516).
   */
  probabilities?: number[];
  /** The model that answered, as Jev names it. */
  jevModel?: string;
  call?: JevCall;
}

/** Below this, Jev's level is not trusted and the build runs at level 4. */
const CONFIDENCE_FLOOR = 0.7;
const UNSURE_LEVEL: Level = 4;
/** The routine's own setting, Sonnet medium, which is level 1's tier. */
const DEFAULT_LEVEL: Level = 1;
const QUESTION_ID = "difficulty";
/**
 * Pinned, not `jev-latest`: that alias moved on 2026-10-14, in the middle of the
 * runs the levels are retuned from (#516).
 */
const JEV_MODEL = "jev-1.14.0";

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
export function routeOnError(error: string, tiers: readonly Tier[], call?: JevCall): Route {
  return { ...tierAt(DEFAULT_LEVEL, tiers), reason: "jev-error", error, jev: null, ...(call && { call }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** How far Jev's probabilities may sum from 1 before the answer counts as empty: they come rounded. */
const SUM_TOLERANCE = 0.02;

/** Jev's response to the difficulty question as a tier, or the default when it cannot be read. */
export function route(response: unknown, tiers: readonly Tier[], call?: JevCall): Route {
  const answer = isRecord(response) && isRecord(response.answers) ? response.answers[QUESTION_ID] : undefined;
  const usage = isRecord(response) && isRecord(response.usage) ? response.usage : {};
  const jevModel = isRecord(response) && typeof response.model === "string" ? response.model : undefined;
  const logged = { ...(jevModel && { jevModel }), ...(call && { call }) };
  if (!isRecord(answer) || !isRecord(answer.probabilities) || typeof answer.confidence !== "number") {
    return { ...routeOnError("Jev's answer could not be read", tiers), ...logged };
  }

  // Levels are 0-based in Jev's answer. The most probable wins; a tie goes to the harder level.
  const probabilities = [0, 1, 2, 3, 4].map((i) => (answer.probabilities as Record<string, unknown>)[String(i)]);
  if (probabilities.some((p) => typeof p !== "number")) {
    return { ...routeOnError("Jev's answer did not score five levels", tiers), ...logged };
  }
  const scores = probabilities as number[];
  // TypeSafe's probabilities sum to 1, so one that does not, all zeros say, is an
  // empty answer. Confidence 0 is not: Score confidence is floored at 0 whenever
  // the spread is as wide as an even one, which is "unsure", the floor's job (#516).
  const sum = scores.reduce((total, p) => total + p, 0);
  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    return { ...routeOnError("Jev's answer was empty", tiers), probabilities: scores, ...logged };
  }
  const top = scores.reduce((best, p, i) => (p >= scores[best] ? i : best), 0);

  const jev: JevVerdict = {
    level: (top + 1) as Level,
    confidence: answer.confidence,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
  };
  const reason = jev.confidence < CONFIDENCE_FLOOR ? "low-confidence" : "jev";
  const tier = tierAt(reason === "jev" ? jev.level : UNSURE_LEVEL, tiers);
  return { ...tier, reason, jev, probabilities: scores, ...logged };
}

/** The statuses TypeSafe says to retry: rate limited, and overloaded. */
const RETRY_STATUSES = new Set([429, 529]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 1000;
/** A `retry-after` past this is not waited for: the build would sit idle instead. */
const MAX_WAIT_MS = 20_000;

/** What `sendWithRetry` needs of a reply: its status and its headers. */
export interface JevReply {
  status: number;
  headers: { get(name: string): string | null };
}

/** How long to wait before the next try: `retry-after` (seconds or a date) when sent, else doubling backoff. */
function waitBefore(attempt: number, reply: JevReply | null, now: number): number {
  const header = reply?.headers.get("retry-after")?.trim();
  if (header) {
    if (/^\d+(\.\d+)?$/.test(header)) return Math.round(Number(header) * 1000);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, at - now);
  }
  return BACKOFF_MS * 2 ** (attempt - 1);
}

/** A thrown error worth another try: a network failure, not our own timeout or abort. */
function isRetryableThrow(error: unknown): boolean {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  return name !== "TimeoutError" && name !== "AbortError";
}

/**
 * Sends the request to Jev, retrying a 429, a 529 or a network error up to
 * three tries with backoff, as TypeSafe recommends (#516). Anything else comes
 * back as it is: an answer, however unsure, is never asked again.
 */
export async function sendWithRetry<R extends JevReply>(
  send: () => Promise<R>,
  opts: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<{ reply: R; call: JevCall } | { thrown: unknown; call: JevCall }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? Date.now;
  const started = now();
  for (let attempt = 1; ; attempt++) {
    let reply: R | null = null;
    let thrown: unknown = null;
    try {
      reply = await send();
    } catch (error) {
      thrown = error;
    }
    const retryable = reply ? RETRY_STATUSES.has(reply.status) : isRetryableThrow(thrown);
    const wait = retryable && attempt < MAX_ATTEMPTS ? waitBefore(attempt, reply, now()) : Infinity;
    if (wait > MAX_WAIT_MS) {
      const call: JevCall = { status: reply?.status ?? null, ms: now() - started, attempts: attempt };
      return reply ? { reply, call } : { thrown, call };
    }
    await sleep(wait);
  }
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
    model: JEV_MODEL,
    state,
    questions: { [QUESTION_ID]: { type: "score", instructions: question, criteria: levels } },
  };
}
