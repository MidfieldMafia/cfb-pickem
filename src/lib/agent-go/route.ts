/**
 * Which model and effort an agent:go build runs on (#463). Jev, TypeSafe's
 * classifier, answers three narrow questions about the ticket (#548): `risk`,
 * a Noul, and `open` and `reach`, Scores on three levels. `combine` turns them
 * into a level 1 to 5, and a table maps each level to a tier. The questions and
 * that table live in `.claude/skills/agent-go/SKILL.md`, where they are
 * retuned, so this reads them from there rather than keeping a copy.
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

/** One Score's answer, kept for retuning the questions (#548). */
export interface ScoreVerdict {
  /** Jev's position along the three levels, 0 to 2. */
  score: number;
  confidence: number;
  /** Level 0 first. */
  probabilities: number[];
  /** What the base level counted it as: `score` rounded half up. */
  counted: 0 | 1 | 2;
}

/** What Jev said, kept for the issue comment and the PR's `Built on:` line. */
export interface JevVerdict {
  /** The `risk` Noul: how likely the answer is yes. */
  risk: number;
  open: ScoreVerdict;
  reach: ScoreVerdict;
  /** `open + reach + 1`, before the risk or confidence rule moved it. */
  base: Level;
  /** The level the rules set, which an escalation leaves as it was. */
  level: Level;
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
  /**
   * The rule that set the level: `base`, the two Scores; `risk`, the risk Noul
   * raised it to 4; `low-confidence`, a Score too unsure moved it to 4;
   * `jev-error`, the routine's default.
   */
  reason: "base" | "risk" | "low-confidence" | "jev-error";
  jev: JevVerdict | null;
  error?: string;
  /** Each Score's probabilities on an error, when Jev scored it, even on an answer called empty (#516). */
  probabilities?: { open?: number[]; reach?: number[] };
  /** The model that answered, as Jev names it. */
  jevModel?: string;
  call?: JevCall;
}

/** At or above this, the `risk` Noul is a yes, and the build runs at level 4 or more. */
const RISK_THRESHOLD = 0.7;
/** A level below 4 needs at least this confidence on both Scores. */
const MOVE_DOWN_CONFIDENCE = 0.6;
/** Below this on either Score, the build runs at level 4 whatever the rest said. */
const UNSURE_CONFIDENCE = 0.3;
/** Where a risky or unsure ticket builds, and what every build ran on before #548. */
const UNSURE_LEVEL: Level = 4;
/** The routine's own setting, Sonnet medium, which is level 1's tier. */
const DEFAULT_LEVEL: Level = 1;
/**
 * Pinned, not `jev-latest`: that alias moved on 2026-10-14, in the middle of the
 * runs the levels are retuned from (#516).
 */
const JEV_MODEL = "jev-1.14.0";

/** The section of the skill that holds Jev's questions, their levels and the table. */
function routingSection(skill: string): string {
  const heading = /^### Jev's question$/m.exec(skill);
  if (!heading) throw new Error("agent-go SKILL.md has no \"### Jev's question\" section");
  const rest = skill.slice(heading.index + heading[0].length);
  const end = rest.search(/^#{1,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The three questions Jev answers, by the id its answer comes back under. */
export interface Questions {
  risk: { instructions: string };
  open: { instructions: string; levels: string[] };
  reach: { instructions: string; levels: string[] };
}

const QUESTION_TYPES = { risk: "noul", open: "score", reach: "score" } as const;
type QuestionId = keyof typeof QUESTION_TYPES;
const SCORE_LEVELS = 3;

/**
 * Jev's three questions, each Score's levels easiest first, and the tier for
 * each level, from the skill. A question is one line,
 * ``Question `<id>` (<type>): <instructions>``; a Score's numbered levels follow
 * it, and one may wrap onto indented lines, which are joined.
 */
export function readSkill(skill: string): { questions: Questions; tiers: Tier[] } {
  const section = routingSection(skill);

  const found = new Map<string, { type: string; instructions: string; levels: string[] }>();
  let current: { levels: string[] } | null = null;
  for (const line of section.split("\n")) {
    const question = /^Question `(\w+)` \((\w+)\): (.+)$/.exec(line);
    const item = /^([1-9])\. (.+)$/.exec(line);
    if (question) {
      current = { levels: [] };
      found.set(question[1], { type: question[2], instructions: question[3].trim(), levels: current.levels });
    } else if (item && current) current.levels.push(item[2].trim());
    else if (/^ {3}\S/.test(line) && current?.levels.length) current.levels[current.levels.length - 1] += ` ${line.trim()}`;
    // Any other text ends a question's levels, so a later numbered list is not read as more of them.
    else if (line.trim()) current = null;
  }
  for (const id of Object.keys(QUESTION_TYPES)) {
    if (!found.has(id)) throw new Error(`agent-go SKILL.md asks Jev no \`${id}\` question`);
  }
  for (const [id, type] of Object.entries(QUESTION_TYPES)) {
    const q = found.get(id)!;
    if (q.type !== type) throw new Error(`agent-go SKILL.md asks \`${id}\` as a ${q.type}, not a ${type}`);
    const want = type === "score" ? SCORE_LEVELS : 0;
    if (q.levels.length !== want) {
      throw new Error(`agent-go SKILL.md gives Jev's \`${id}\` ${q.levels.length} levels, not ${want}`);
    }
  }
  const get = (id: QuestionId) => found.get(id)!;
  const questions: Questions = {
    risk: { instructions: get("risk").instructions },
    open: { instructions: get("open").instructions, levels: get("open").levels },
    reach: { instructions: get("reach").instructions, levels: get("reach").levels },
  };

  const tiers: Tier[] = [];
  for (const row of section.matchAll(/^\| ([1-5]) \| `(sonnet|opus)` \| `(low|medium|high)` \|/gm)) {
    tiers.push({ level: Number(row[1]) as Level, model: row[2] as Tier["model"], effort: row[3] as Tier["effort"] });
  }
  if (tiers.length !== 5 || tiers.some((tier, i) => tier.level !== i + 1)) {
    throw new Error(`agent-go SKILL.md's tier table has ${tiers.length} rows, not levels 1 to 5 in order`);
  }

  return { questions, tiers };
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

/** A Score answer read, or why it could not be. */
function readScore(answer: unknown, id: "open" | "reach"): ScoreVerdict | { error: string; probabilities?: number[] } {
  if (!isRecord(answer) || !isRecord(answer.probabilities)) return { error: "Jev's answer could not be read" };
  if (typeof answer.score !== "number" || typeof answer.confidence !== "number") {
    return { error: "Jev's answer could not be read" };
  }
  const raw = answer.probabilities;
  const probabilities = Array.from({ length: SCORE_LEVELS }, (_, i) => raw[String(i)]);
  if (probabilities.some((p) => typeof p !== "number") || Object.keys(raw).length !== SCORE_LEVELS) {
    return { error: `Jev's answer did not score three levels for ${id}` };
  }
  const scores = probabilities as number[];
  // TypeSafe's probabilities sum to 1, so one that does not, all zeros say, is an
  // empty answer. Confidence 0 is not: Score confidence is floored at 0 whenever
  // the spread is as wide as an even one, which is "unsure", the low-confidence rule's job (#516).
  const sum = scores.reduce((total, p) => total + p, 0);
  if (Math.abs(sum - 1) > SUM_TOLERANCE) return { error: "Jev's answer was empty", probabilities: scores };
  // Half up, from Jev's position along the levels: never its most probable level (#548).
  const counted = Math.min(SCORE_LEVELS - 1, Math.max(0, Math.floor(answer.score + 0.5))) as 0 | 1 | 2;
  return { score: answer.score, confidence: answer.confidence, probabilities: scores, counted };
}

/** The level the three answers set, and the rule that set it (`.claude/skills/agent-go/SKILL.md`). */
function combine(risk: number, open: ScoreVerdict, reach: ScoreVerdict): { base: Level; level: Level; reason: Route["reason"] } {
  const base = Math.min(5, open.counted + reach.counted + 1) as Level;
  const confidence = Math.min(open.confidence, reach.confidence);
  if (risk >= RISK_THRESHOLD && base < UNSURE_LEVEL) return { base, level: UNSURE_LEVEL, reason: "risk" };
  if (confidence < UNSURE_CONFIDENCE && base !== UNSURE_LEVEL) return { base, level: UNSURE_LEVEL, reason: "low-confidence" };
  if (confidence < MOVE_DOWN_CONFIDENCE && base < UNSURE_LEVEL) return { base, level: UNSURE_LEVEL, reason: "low-confidence" };
  return { base, level: base, reason: "base" };
}

/** Jev's answers to the three questions as a tier, or the default when they cannot be read. */
export function route(response: unknown, tiers: readonly Tier[], call?: JevCall): Route {
  const answers = isRecord(response) && isRecord(response.answers) ? response.answers : {};
  const usage = isRecord(response) && isRecord(response.usage) ? response.usage : {};
  const jevModel = isRecord(response) && typeof response.model === "string" ? response.model : undefined;
  const logged = { ...(jevModel && { jevModel }), ...(call && { call }) };

  const riskAnswer = answers.risk;
  const risk = isRecord(riskAnswer) && typeof riskAnswer.noul === "number" ? riskAnswer.noul : null;
  const open = readScore(answers.open, "open");
  const reach = readScore(answers.reach, "reach");
  const scored = {
    ...("probabilities" in open && { open: open.probabilities }),
    ...("probabilities" in reach && { reach: reach.probabilities }),
  };
  const kept = Object.keys(scored).length ? { probabilities: scored } : {};
  if (risk === null) return { ...routeOnError("Jev's answer could not be read", tiers), ...kept, ...logged };
  if ("error" in open) return { ...routeOnError(open.error, tiers), ...kept, ...logged };
  if ("error" in reach) return { ...routeOnError(reach.error, tiers), ...kept, ...logged };

  const { base, level, reason } = combine(risk, open, reach);
  const jev: JevVerdict = {
    risk,
    open,
    reach,
    base,
    level,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
  };
  return { ...tierAt(level, tiers), reason, jev, ...logged };
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

/** The request body for Jev's System One endpoint: the skill's three questions in one request. */
export function jevRequest(state: JevState, questions: Questions) {
  return {
    model: JEV_MODEL,
    state,
    questions: {
      risk: { type: "noul", instructions: questions.risk.instructions },
      open: { type: "score", instructions: questions.open.instructions, criteria: questions.open.levels },
      reach: { type: "score", instructions: questions.reach.instructions, criteria: questions.reach.levels },
    },
  };
}
