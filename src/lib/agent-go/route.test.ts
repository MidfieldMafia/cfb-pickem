/**
 * The agent:go routine asks Jev how hard a ticket is and builds it on the tier
 * that answer picks (#463). An under-powered build of a hard ticket costs a bad
 * PR and an over-powered one costs tokens, so the rules that turn Jev's answer
 * into a tier are tested here, and so is the skill's own table they read.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { escalate, jevRequest, jevState, namedPaths, readSkill, route, routeOnError, sendWithRetry, type Tier } from "./route";

const TIERS: Tier[] = [
  { level: 1, model: "sonnet", effort: "medium" },
  { level: 2, model: "sonnet", effort: "high" },
  { level: 3, model: "opus", effort: "low" },
  { level: 4, model: "opus", effort: "medium" },
  { level: 5, model: "opus", effort: "high" },
];

/** One Score answer on three levels, numbered from 0; `score` is Jev's position along them. */
interface ScoreAnswer {
  probabilities: number[];
  confidence?: number;
  score?: number;
}

/** Jev's answer to the three questions. A Score left out is missing from the answer. */
function answer(a: { risk?: number; open?: ScoreAnswer; reach?: ScoreAnswer }) {
  const score = ({ probabilities, confidence = 0.9, score }: ScoreAnswer) => ({
    type: "score",
    score: score ?? probabilities.reduce((sum, p, i) => sum + p * i, 0),
    confidence,
    probabilities: Object.fromEntries(probabilities.map((p, i) => [String(i), p])),
  });
  return {
    model: "jev-1.14.0",
    answers: {
      ...(a.risk !== undefined && { risk: { type: "noul", noul: a.risk } }),
      ...(a.open && { open: score(a.open) }),
      ...(a.reach && { reach: score(a.reach) }),
    },
    usage: { input_tokens: 1200, output_tokens: 33 },
  };
}

/** A Score with all its weight on one level, 0 to 2. */
const at = (level: 0 | 1 | 2, confidence = 0.9): ScoreAnswer => ({
  probabilities: [0, 1, 2].map((i) => (i === level ? 1 : 0)),
  confidence,
});

describe("readSkill", () => {
  const skill = readFileSync(path.join(process.cwd(), ".claude/skills/agent-go/SKILL.md"), "utf8");

  test("the skill's table is decision 2 of #463", () => {
    expect(readSkill(skill).tiers).toEqual(TIERS);
  });

  test("the skill gives Jev three questions: a risk Noul, and open and reach on three levels each", () => {
    const { questions } = readSkill(skill);
    expect(Object.keys(questions)).toEqual(["risk", "open", "reach"]);
    expect(questions.risk.instructions).toMatch(/CRON_SECRET/);
    expect(questions.risk.instructions).toMatch(/#486/);
    expect(questions.open.levels).toHaveLength(3);
    expect(questions.reach.levels).toHaveLength(3);
    expect(questions.open.levels[0]).toMatch(/^Nothing left to decide/);
    expect(questions.reach.levels[2]).toMatch(/several screens/);
    for (const level of [...questions.open.levels, ...questions.reach.levels]) expect(level).not.toMatch(/\n/);
  });

  test("the routing rules' numbered list under the table is not read as levels", () => {
    const { questions } = readSkill(skill);
    for (const level of questions.reach.levels) expect(level).not.toMatch(/base|low-confidence/);
  });

  test("a skill missing a tier, a question or a level is refused, not half-read", () => {
    expect(() => readSkill(skill.replace(/^\| 5 \|.*$/m, ""))).toThrow(/tier/);
    expect(() => readSkill(skill.replace(/^Question `risk`.*$/m, ""))).toThrow(/risk/);
    expect(() => readSkill(skill.replace(/^Question `reach`.*$/m, ""))).toThrow(/reach/);
    const noLevel = skill.replace(/^3\. Design questions.*$/m, "");
    expect(() => readSkill(noLevel)).toThrow(/open.*2 levels, not 3/);
  });

  test("a question of the wrong type is refused", () => {
    expect(() => readSkill(skill.replace("Question `risk` (noul)", "Question `risk` (score)"))).toThrow(/risk.*noul/);
  });
});

describe("route", () => {
  test("a low-risk, settled, one-layer ticket builds at level 1, and one that adds a server half at 2", () => {
    // #490's own answer from jev-1.14.0, for `risk` and `open`.
    const settled = { probabilities: [0.86, 0.1, 0.04], confidence: 0.73, score: 0.19 };
    const r = route(answer({ risk: 0.08, open: settled, reach: at(0) }), TIERS);
    expect(r).toMatchObject({ level: 1, model: "sonnet", effort: "medium", reason: "base" });
    expect(r.jev).toEqual({
      risk: 0.08,
      open: { score: 0.19, confidence: 0.73, probabilities: [0.86, 0.1, 0.04], counted: 0 },
      reach: { score: 0, confidence: 0.9, probabilities: [1, 0, 0], counted: 0 },
      base: 1,
      level: 1,
      inputTokens: 1200,
      outputTokens: 33,
    });
    expect(route(answer({ risk: 0.08, open: settled, reach: at(1) }), TIERS)).toMatchObject({ level: 2, effort: "high", reason: "base" });
  });

  test("the base level is open + reach + 1, so both at 2 is level 5", () => {
    expect(route(answer({ risk: 0.1, open: at(1), reach: at(1) }), TIERS)).toMatchObject({ level: 3, model: "opus", effort: "low" });
    expect(route(answer({ risk: 0.1, open: at(2), reach: at(2) }), TIERS)).toMatchObject({ level: 5, effort: "high", reason: "base" });
  });

  test("a risk Noul of 0.8 raises a level-1 ticket to level 4, and leaves a level 5 at 5", () => {
    const r = route(answer({ risk: 0.8, open: at(0), reach: at(0) }), TIERS);
    expect(r).toMatchObject({ level: 4, model: "opus", effort: "medium", reason: "risk", jev: { base: 1, level: 4, risk: 0.8 } });
    expect(route(answer({ risk: 0.8, open: at(2), reach: at(2) }), TIERS)).toMatchObject({ level: 5, reason: "base" });
  });

  test("risk of exactly 0.7 counts, and 0.69 does not", () => {
    expect(route(answer({ risk: 0.7, open: at(0), reach: at(0) }), TIERS)).toMatchObject({ level: 4, reason: "risk" });
    expect(route(answer({ risk: 0.69, open: at(0), reach: at(0) }), TIERS)).toMatchObject({ level: 1, reason: "base" });
  });

  test("either Score below 0.3 confidence builds at level 4, whatever the rest said", () => {
    expect(route(answer({ risk: 0.1, open: at(0, 0.29), reach: at(0) }), TIERS)).toMatchObject({
      level: 4,
      model: "opus",
      effort: "medium",
      reason: "low-confidence",
      jev: { base: 1 },
    });
    expect(route(answer({ risk: 0.1, open: at(2), reach: at(2, 0.12) }), TIERS)).toMatchObject({ level: 4, reason: "low-confidence" });
    // Confidence 0 is TypeSafe's floor for a wide spread: unsure, not an error (#516).
    const wide = route(answer({ risk: 0.1, open: { probabilities: [0.34, 0.33, 0.33], confidence: 0 }, reach: at(0) }), TIERS);
    expect(wide).toMatchObject({ level: 4, reason: "low-confidence" });
    expect(wide.error).toBeUndefined();
  });

  test("moving below level 4 needs confidence 0.6 on both Scores; between 0.3 and 0.6 a level 5 stands", () => {
    expect(route(answer({ risk: 0.1, open: at(0, 0.59), reach: at(1) }), TIERS)).toMatchObject({ level: 4, reason: "low-confidence" });
    expect(route(answer({ risk: 0.1, open: at(0, 0.6), reach: at(1, 0.6) }), TIERS)).toMatchObject({ level: 2, reason: "base" });
    expect(route(answer({ risk: 0.1, open: at(2, 0.45), reach: at(2) }), TIERS)).toMatchObject({ level: 5, reason: "base" });
    // Risk already put it at 4, so the low confidence changes nothing.
    expect(route(answer({ risk: 0.9, open: at(0, 0.45), reach: at(0) }), TIERS)).toMatchObject({ level: 4, reason: "risk" });
  });

  test("each Score counts as its score rounded half up, not its most probable level", () => {
    // The old rule broke this tie to the harder level, 2; its position is 1.0.
    const split = { probabilities: [0.45, 0.1, 0.45], score: 1 };
    expect(route(answer({ risk: 0.1, open: split, reach: at(0) }), TIERS).jev?.open.counted).toBe(1);
    const leans = { probabilities: [0.6, 0, 0.4], score: 0.8 };
    expect(route(answer({ risk: 0.1, open: leans, reach: at(0) }), TIERS).jev?.open.counted).toBe(1);
    expect(route(answer({ risk: 0.1, open: { probabilities: [0.5, 0.5, 0], score: 0.5 }, reach: at(0) }), TIERS).jev?.open.counted).toBe(1);
    expect(route(answer({ risk: 0.1, open: { probabilities: [0, 0.51, 0.49], score: 1.49 }, reach: at(0) }), TIERS).jev?.open.counted).toBe(1);
  });

  test("replays #544: its lean, read by position, builds at level 2 where the old floor built it at 4", () => {
    // #544 (pennant menu on Picks) scored .10/.51/.37/.01/.01 on the old five levels at
    // confidence 0.57, so the 0.7 floor sent it to level 4. Its last two levels fold
    // into the third here. Hindsight graded it open 0, reach 1: level 2.
    const reach = { probabilities: [0.1, 0.51, 0.39], confidence: 0.62 };
    expect(route(answer({ risk: 0.05, open: at(0, 0.8), reach }), TIERS)).toMatchObject({ level: 2, reason: "base", jev: { reach: { counted: 1 } } });
    // With more weight at the top end, its most probable level is 2, but its position, 1.2, counts 1.
    const ends = { probabilities: [0.25, 0.3, 0.45], confidence: 0.62 };
    expect(route(answer({ risk: 0.05, open: at(0, 0.8), reach: ends }), TIERS)).toMatchObject({ jev: { reach: { counted: 1 } } });
  });

  test("replays #548's hindsight grading: the hand-set answers give the Needed levels", () => {
    // [PR, risk, open, reach, needed] from the grading table in #548's comments.
    // #539 (graded 4-5) and #535 (graded 5) need open 2 for level 5, so they land at 4:
    // both were risky and wide with small calls of their own, and Opus medium is what
    // every risky build ran on without a failure.
    const graded: [number, boolean, 0 | 1 | 2, 0 | 1 | 2, number][] = [
      [483, false, 0, 0, 1], [490, false, 0, 0, 1], [544, false, 0, 1, 2], [469, false, 1, 0, 2],
      [518, false, 0, 1, 2], [520, false, 1, 0, 2], [471, false, 1, 1, 3], [486, false, 1, 1, 3],
      [542, true, 0, 1, 4], [541, true, 0, 1, 4], [487, true, 1, 1, 4], [540, true, 1, 2, 4],
      [478, true, 0, 2, 4], [547, true, 0, 2, 4], [539, true, 1, 2, 4], [470, true, 2, 2, 5],
      [535, true, 1, 2, 4],
    ];
    for (const [pr, risky, open, reach, needed] of graded) {
      const r = route(answer({ risk: risky ? 0.9 : 0.1, open: at(open), reach: at(reach) }), TIERS);
      expect({ pr, level: r.level }).toEqual({ pr, level: needed });
    }
  });

  test("an empty answer on either Score is reported, with the probabilities kept", () => {
    const empty = { probabilities: [0, 0, 0], confidence: 0.9 };
    for (const r of [
      route(answer({ risk: 0.1, open: empty, reach: at(1) }), TIERS),
      route(answer({ risk: 0.1, open: at(1), reach: empty }), TIERS),
      route(answer({ risk: 0.1, open: at(1), reach: { probabilities: [0.4, 0.4, 0.4] } }), TIERS),
    ]) {
      expect(r).toMatchObject({ level: 1, model: "sonnet", reason: "jev-error", error: "Jev's answer was empty", jev: null });
    }
    expect(route(answer({ risk: 0.1, open: at(1), reach: empty }), TIERS).probabilities).toEqual({ open: [0, 1, 0], reach: [0, 0, 0] });
  });

  test("rounding in Jev's probabilities is not an empty answer", () => {
    expect(route(answer({ risk: 0.1, open: { probabilities: [0.33, 0.33, 0.33] }, reach: at(0) }), TIERS).reason).not.toBe("jev-error");
  });

  test("an answer missing a question, or a Score not on three levels, is an error built on the routine's default", () => {
    const error = { level: 1, model: "sonnet", effort: "medium", reason: "jev-error", jev: null };
    expect(route({ answers: {} }, TIERS)).toMatchObject({ ...error, error: "Jev's answer could not be read" });
    expect(route("not json", TIERS).reason).toBe("jev-error");
    expect(route(answer({ open: at(0), reach: at(0) }), TIERS)).toMatchObject({ ...error, error: "Jev's answer could not be read" });
    expect(route(answer({ risk: 0.1, reach: at(0) }), TIERS)).toMatchObject(error);
    expect(route(answer({ risk: 0.1, open: { probabilities: [0.5, 0.5] }, reach: at(0) }), TIERS)).toMatchObject({
      ...error,
      error: "Jev's answer did not score three levels for open",
    });
  });

  test("keeps the model that answered", () => {
    expect(route(answer({ risk: 0.1, open: at(0), reach: at(0) }), TIERS).jevModel).toBe("jev-1.14.0");
  });

  test("the call's status, time and attempts ride along on the route", () => {
    const call = { status: 200, ms: 2300, attempts: 2 };
    expect(route(answer({ risk: 0.1, open: at(0), reach: at(0) }), TIERS, call).call).toEqual(call);
    expect(routeOnError("HTTP 529 from Jev", TIERS, { status: 529, ms: 9000, attempts: 3 }).call).toMatchObject({ status: 529 });
  });
});

describe("sendWithRetry", () => {
  /** A reply with this status and, optionally, a `retry-after` header. */
  function reply(status: number, retryAfter?: string) {
    return { status, headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null) } };
  }

  /** Sends the scripted replies in order (an Error is thrown), recording every wait. */
  function harness(script: (ReturnType<typeof reply> | Error)[]) {
    const waits: number[] = [];
    let clock = 0;
    let sent = 0;
    const send = async () => {
      const next = script[sent++];
      clock += 100;
      if (next instanceof Error) throw next;
      return next;
    };
    const sleep = async (ms: number) => {
      waits.push(ms);
      clock += ms;
    };
    return { send, waits, sent: () => sent, opts: { sleep, now: () => clock } };
  }

  test("a 429 is retried with backoff until Jev answers", async () => {
    const h = harness([reply(429), reply(429), reply(200)]);
    const result = await sendWithRetry(h.send, h.opts);
    expect(result).toMatchObject({ reply: { status: 200 }, call: { status: 200, attempts: 3 } });
    expect(h.waits).toEqual([1000, 2000]);
    expect(result.call.ms).toBe(3300);
  });

  test("a 529 honours retry-after, in seconds or as a date", async () => {
    const h = harness([reply(529, "5"), reply(200)]);
    await sendWithRetry(h.send, h.opts);
    expect(h.waits).toEqual([5000]);

    // The clock reads 100 ms when the first reply is in, so a date 9 s after epoch is 8.9 s away.
    const dated = harness([reply(529, new Date(9000).toUTCString()), reply(200)]);
    await sendWithRetry(dated.send, dated.opts);
    expect(dated.waits).toEqual([8900]);
  });

  test("a network error is retried, and the reply after it kept", async () => {
    const h = harness([new TypeError("fetch failed"), reply(200)]);
    expect(await sendWithRetry(h.send, h.opts)).toMatchObject({ reply: { status: 200 }, call: { attempts: 2 } });
  });

  test("gives up after three tries with the last reply or error", async () => {
    const busy = harness([reply(529), reply(529), reply(529), reply(200)]);
    expect(await sendWithRetry(busy.send, busy.opts)).toMatchObject({ reply: { status: 529 }, call: { status: 529, attempts: 3 } });
    expect(busy.sent()).toBe(3);

    const down = harness([new TypeError("a"), new TypeError("b"), new TypeError("c")]);
    const result = await sendWithRetry(down.send, down.opts);
    expect(result).toMatchObject({ call: { status: null, attempts: 3 } });
    expect("thrown" in result && (result.thrown as Error).message).toBe("c");
  });

  test("a retry-after longer than the run can wait is not waited for", async () => {
    const h = harness([reply(429, "120"), reply(200)]);
    expect(await sendWithRetry(h.send, h.opts)).toMatchObject({ reply: { status: 429 }, call: { attempts: 1 } });
    expect(h.waits).toEqual([]);
  });

  test("an answer, a refused key, another error status or a timeout is never retried", async () => {
    for (const first of [reply(200), reply(401), reply(500), new DOMException("timed out", "TimeoutError")]) {
      const h = harness([first, reply(200)]);
      await sendWithRetry(h.send, h.opts);
      expect(h.sent()).toBe(1);
    }
  });
});

describe("routeOnError", () => {
  test("a hard error builds on Sonnet medium and keeps the reason", () => {
    expect(routeOnError("TYPESAFE_API_KEY is not set", TIERS)).toEqual({
      level: 1,
      model: "sonnet",
      effort: "medium",
      reason: "jev-error",
      error: "TYPESAFE_API_KEY is not set",
      jev: null,
    });
  });
});

describe("escalate", () => {
  test("goes one level up and keeps what Jev said", () => {
    const first = route(answer({ risk: 0.1, open: at(0), reach: at(1) }), TIERS);
    expect(escalate(first, TIERS)).toMatchObject({ level: 3, model: "opus", effort: "low", reason: "base", jev: { level: 2 } });
  });

  test("a run on the default after a Jev error escalates to level 2", () => {
    expect(escalate(routeOnError("HTTP 500", TIERS), TIERS)).toMatchObject({ level: 2, effort: "high" });
  });

  test("level 5 never escalates", () => {
    expect(escalate(route(answer({ risk: 0.9, open: at(2), reach: at(2) }), TIERS), TIERS)).toBeNull();
  });
});

describe("namedPaths", () => {
  test("finds the files a brief names in backticks, once each", () => {
    const brief = [
      "**Change:** `.claude/skills/agent-go/SKILL.md`, in the step that opens the PR.",
      "Record the results in `docs/agents/cloud-environment.md`, and `src/lib/spread.ts:12` too.",
      "Again `.claude/skills/agent-go/SKILL.md`.",
    ].join("\n");
    expect(namedPaths(brief)).toEqual([
      ".claude/skills/agent-go/SKILL.md",
      "docs/agents/cloud-environment.md",
      "src/lib/spread.ts",
    ]);
  });

  test("leaves out commands, labels, numbers, hosts, URLs and app routes", () => {
    const brief =
      "Run `npm run agent-db -- up`, label `agent:go`, threshold `0.7`, host `api.typesafe.ai`, " +
      "`https://docs.typesafe.ai/introduction`, model `jev-latest`, flag `--width 360`, screen `/picks/review`.";
    expect(namedPaths(brief)).toEqual([]);
  });

  test("keeps a bare file name with a known extension", () => {
    expect(namedPaths("Edit `CHANGELOG.md` and `vitest.config.mts`.")).toEqual(["CHANGELOG.md", "vitest.config.mts"]);
  });
});

describe("jevState", () => {
  const issue = {
    title: "Rename the Save button",
    body: "## Agent Brief\n\nChange `src/components/save.tsx`.",
    labels: ["ready-for-agent", "owner:jonah"],
  };

  test("carries the issue, its brief and spec comments, the map and the named paths with line counts", () => {
    const state = jevState({
      issue,
      comments: ["Looks good", "## Spec\n\nAlso `src/lib/save.ts`.", "Queued behind #12"],
      parentMap: "Saturday Slate v4 roadmap",
      lineCount: (file) => (file === "src/lib/save.ts" ? 40 : null),
    });
    expect(state).toEqual({
      title: "Rename the Save button",
      body: issue.body,
      labels: ["ready-for-agent", "owner:jonah"],
      hasAgentBrief: true,
      briefComments: ["## Spec\n\nAlso `src/lib/save.ts`."],
      parentMap: "Saturday Slate v4 roadmap",
      paths: [
        { path: "src/components/save.tsx", lines: null },
        { path: "src/lib/save.ts", lines: 40 },
      ],
    });
  });

  test("a ticket whose brief is only in a comment still has one", () => {
    const state = jevState({
      issue: { ...issue, body: "From grilling #12." },
      comments: ["## Agent Brief\n\nDo it."],
      parentMap: null,
      lineCount: () => null,
    });
    expect(state.hasAgentBrief).toBe(true);
    expect(state.parentMap).toBeNull();
  });

  test("a to-tickets ticket, What to build with its Acceptance, is a brief", () => {
    const body = "## What's wrong\n\nThe S sits high.\n\n## What to build\n\nCentre it.\n\n## Acceptance\n\n- [ ] Centred\n\n## Blocked by\n\nNone";
    const state = jevState({ issue: { ...issue, body }, comments: [], parentMap: null, lineCount: () => null });
    expect(state.hasAgentBrief).toBe(true);
  });

  test("What to build with no Acceptance is not a brief yet", () => {
    const state = jevState({ issue: { ...issue, body: "## What to build\n\nSomething." }, comments: [], parentMap: null, lineCount: () => null });
    expect(state.hasAgentBrief).toBe(false);
  });

  test("no brief anywhere says so", () => {
    const state = jevState({ issue: { ...issue, body: "Make it nicer." }, comments: [], parentMap: null, lineCount: () => null });
    expect(state.hasAgentBrief).toBe(false);
    expect(state.paths).toEqual([]);
  });
});

describe("jevRequest", () => {
  test("asks risk as a Noul and open and reach as Scores, on the pinned jev-1.14.0, not the moving jev-latest", () => {
    const state = jevState({ issue: { title: "t", body: "b", labels: [] }, comments: [], parentMap: null, lineCount: () => null });
    const questions = {
      risk: { instructions: "Risky?" },
      open: { instructions: "Open?", levels: ["a", "b", "c"] },
      reach: { instructions: "Far?", levels: ["d", "e", "f"] },
    };
    expect(jevRequest(state, questions)).toEqual({
      model: "jev-1.14.0",
      state,
      questions: {
        risk: { type: "noul", instructions: "Risky?" },
        open: { type: "score", instructions: "Open?", criteria: ["a", "b", "c"] },
        reach: { type: "score", instructions: "Far?", criteria: ["d", "e", "f"] },
      },
    });
  });
});
