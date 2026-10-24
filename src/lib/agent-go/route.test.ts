/**
 * The agent:go routine asks Jev how hard a ticket is and builds it on the tier
 * that answer picks (#463). An under-powered build of a hard ticket costs a bad
 * PR and an over-powered one costs tokens, so the rules that turn Jev's answer
 * into a tier are tested here, and so is the skill's own table they read.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { escalate, jevRequest, jevState, namedPaths, readSkill, route, routeOnError, type Tier } from "./route";

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
    model: "jev-1.13.0",
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

  test("no brief anywhere says so", () => {
    const state = jevState({ issue: { ...issue, body: "Make it nicer." }, comments: [], parentMap: null, lineCount: () => null });
    expect(state.hasAgentBrief).toBe(false);
    expect(state.paths).toEqual([]);
  });
});

describe("jevRequest", () => {
  test("asks one Score question on jev-latest with the skill's levels as criteria", () => {
    const state = jevState({ issue: { title: "t", body: "b", labels: [] }, comments: [], parentMap: null, lineCount: () => null });
    expect(jevRequest(state, "How hard?", ["a", "b", "c", "d", "e"])).toEqual({
      model: "jev-latest",
      state,
      questions: { difficulty: { type: "score", instructions: "How hard?", criteria: ["a", "b", "c", "d", "e"] } },
    });
  });
});
