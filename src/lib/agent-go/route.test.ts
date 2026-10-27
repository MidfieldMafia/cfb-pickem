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

/** Jev's answer to the difficulty question, its levels numbered from 0. */
function answer(probabilities: number[], confidence: number) {
  return {
    model: "jev-1.14.0",
    answers: {
      difficulty: {
        type: "score",
        score: probabilities.reduce((sum, p, i) => sum + p * i, 0),
        confidence,
        probabilities: Object.fromEntries(probabilities.map((p, i) => [String(i), p])),
      },
    },
    usage: { input_tokens: 1200, output_tokens: 18 },
  };
}

describe("readSkill", () => {
  const skill = readFileSync(path.join(process.cwd(), ".claude/skills/agent-go/SKILL.md"), "utf8");

  test("the skill's table is decision 2 of #463", () => {
    expect(readSkill(skill).tiers).toEqual(TIERS);
  });

  test("the skill gives Jev one question and five levels, easiest first", () => {
    const { question, levels } = readSkill(skill);
    expect(question.length).toBeGreaterThan(10);
    expect(levels).toHaveLength(5);
    expect(levels[0]).toContain("#334");
    for (const level of levels) expect(level).not.toMatch(/\n/);
  });

  test("a skill missing a level or a tier is refused, not half-read", () => {
    const short = skill.replace(/^\| 5 \|.*$/m, "");
    expect(() => readSkill(short)).toThrow(/tier/);
    const noLevel = skill.replace(/^5\. .*$/m, "");
    expect(() => readSkill(noLevel)).toThrow(/level/);
  });
});

describe("route", () => {
  test("Jev's most likely level picks the tier", () => {
    const r = route(answer([0, 0.1, 0.8, 0.1, 0], 0.82), TIERS);
    expect(r).toMatchObject({ level: 3, model: "opus", effort: "low", reason: "jev" });
    expect(r.jev).toEqual({ level: 3, confidence: 0.82, inputTokens: 1200, outputTokens: 18 });
  });

  test("a tie between two levels goes to the harder one", () => {
    expect(route(answer([0.5, 0.5, 0, 0, 0], 0.75), TIERS).level).toBe(2);
  });

  test("confidence below 0.7 builds at level 4, whatever Jev leaned to", () => {
    expect(route(answer([0.6, 0.4, 0, 0, 0], 0.55), TIERS)).toMatchObject({
      level: 4,
      model: "opus",
      effort: "medium",
      reason: "low-confidence",
      jev: { level: 1, confidence: 0.55 },
    });
    expect(route(answer([0, 0, 0, 0.4, 0.6], 0.69), TIERS).level).toBe(4);
  });

  test("confidence of exactly 0.7 is trusted", () => {
    expect(route(answer([1, 0, 0, 0, 0], 0.7), TIERS)).toMatchObject({ level: 1, reason: "jev" });
  });

  test("an answer without the difficulty question is an error, built on the routine's default", () => {
    expect(route({ answers: {} }, TIERS)).toMatchObject({
      level: 1,
      model: "sonnet",
      effort: "medium",
      reason: "jev-error",
      jev: null,
    });
    expect(route("not json", TIERS).reason).toBe("jev-error");
    expect(route(answer([0.5, 0.5], 0.9), TIERS).reason).toBe("jev-error");
  });

  test("confidence 0 on a spread that sums to 1 is unsure, not empty: level 4 and no error (#516)", () => {
    // TypeSafe floors Score confidence at 0 when the spread is as wide as an even one.
    const r = route(answer([0.1, 0.1, 0.15, 0.25, 0.4], 0), TIERS);
    expect(r).toMatchObject({ level: 4, model: "opus", effort: "medium", reason: "low-confidence", jev: { level: 5, confidence: 0 } });
    expect(r.error).toBeUndefined();
    expect(route(answer([0.2, 0.2, 0.2, 0.2, 0.2], 0), TIERS).reason).toBe("low-confidence");
  });

  test("probabilities that do not sum to about 1 are an empty answer, whatever the confidence", () => {
    expect(route(answer([0, 0, 0, 0, 0], 0), TIERS)).toMatchObject({ reason: "jev-error", error: "Jev's answer was empty" });
    expect(route(answer([0, 0, 0, 0, 0], 0.9), TIERS)).toMatchObject({ reason: "jev-error", error: "Jev's answer was empty" });
    expect(route(answer([0.3, 0.3, 0.3, 0.3, 0.3], 0.8), TIERS).reason).toBe("jev-error");
  });

  test("rounding in Jev's probabilities is not an empty answer", () => {
    expect(route(answer([0.33, 0.33, 0.33, 0, 0], 0.4), TIERS).reason).toBe("low-confidence");
  });

  test("keeps Jev's five probabilities and the model that answered, even on an answer called empty", () => {
    const r = route(answer([0, 0.1, 0.8, 0.1, 0], 0.82), TIERS);
    expect(r.jevModel).toBe("jev-1.14.0");
    expect(r.probabilities).toEqual([0, 0.1, 0.8, 0.1, 0]);
    expect(route(answer([0, 0, 0, 0, 0], 0), TIERS).probabilities).toEqual([0, 0, 0, 0, 0]);
  });

  test("the call's status, time and attempts ride along on the route", () => {
    const call = { status: 200, ms: 2300, attempts: 2 };
    expect(route(answer([0, 0.1, 0.8, 0.1, 0], 0.82), TIERS, call).call).toEqual(call);
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
    const first = route(answer([0, 0.9, 0.1, 0, 0], 0.9), TIERS);
    expect(escalate(first, TIERS)).toMatchObject({ level: 3, model: "opus", effort: "low", jev: first.jev });
  });

  test("a run on the default after a Jev error escalates to level 2", () => {
    expect(escalate(routeOnError("HTTP 500", TIERS), TIERS)).toMatchObject({ level: 2, effort: "high" });
  });

  test("level 5 never escalates", () => {
    expect(escalate(route(answer([0, 0, 0, 0, 1], 1), TIERS), TIERS)).toBeNull();
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
  test("asks one Score question on the pinned jev-1.14.0, not the moving jev-latest, with the skill's levels as criteria", () => {
    const state = jevState({ issue: { title: "t", body: "b", labels: [] }, comments: [], parentMap: null, lineCount: () => null });
    expect(jevRequest(state, "How hard?", ["a", "b", "c", "d", "e"])).toEqual({
      model: "jev-1.14.0",
      state,
      questions: { difficulty: { type: "score", instructions: "How hard?", criteria: ["a", "b", "c", "d", "e"] } },
    });
  });
});
