import { describe, expect, test } from "vitest";
import { builtOnLine, formatTokens, jevPart, replaceBuiltOn } from "./built-on";
import type { JevVerdict, Route } from "./route";

const base = { level: 4, model: "opus", effort: "medium" } as const;
const jev: JevVerdict = {
  risk: 0.82,
  open: { score: 0.4, confidence: 0.7, probabilities: [0.6, 0.4, 0], counted: 0 },
  reach: { score: 1.1, confidence: 0.65, probabilities: [0.1, 0.7, 0.2], counted: 1 },
  base: 2,
  level: 4,
  inputTokens: 1113,
  outputTokens: 17,
};
const answers = "risk 0.82, open 0.4 at 0.7 (0.6/0.4/0), reach 1.1 at 0.65 (0.1/0.7/0.2), 1.1k tokens";

describe("formatTokens", () => {
  test("small, thousands and millions", () => {
    expect(formatTokens(640)).toBe("640");
    expect(formatTokens(1130)).toBe("1.1k");
    expect(formatTokens(65025)).toBe("65k");
    expect(formatTokens(640_000)).toBe("640k");
    expect(formatTokens(1_900_000)).toBe("1.9M");
  });
});

describe("jevPart", () => {
  test("names the level, the rule that set it and all three answers (#548)", () => {
    expect(jevPart({ ...base, reason: "risk", jev })).toBe(`Jev level 4 by risk, ${answers}`);
    expect(jevPart({ ...base, level: 2, reason: "base", jev: { ...jev, level: 2 } })).toBe(`Jev level 2 by base, ${answers}`);
    expect(jevPart({ ...base, reason: "low-confidence", jev })).toBe(`Jev level 4 by low confidence, ${answers}`);
  });

  test("an escalated route still names the level the rules set for the first leg", () => {
    expect(jevPart({ ...base, level: 5, effort: "high", reason: "risk", jev })).toMatch(/^Jev level 4 by risk,/);
    expect(jevPart({ ...base, level: 3, reason: "base", jev: { ...jev, level: 2 } })).toMatch(/^Jev level 2 by base,/);
  });

  test("an error says so and that the routine's default built it", () => {
    expect(jevPart({ ...base, reason: "jev-error", jev: null, error: "HTTP 500 from Jev" })).toBe(
      "Jev error: HTTP 500 from Jev, routine default",
    );
  });

  test("rounds each number to two places", () => {
    const loose = { ...jev, risk: 0.8234, open: { ...jev.open, score: 0.30000000000000004, probabilities: [0.1234, 0.5766, 0.3] } };
    expect(jevPart({ ...base, reason: "risk", jev: loose })).toContain("risk 0.82, open 0.3 at 0.7 (0.12/0.58/0.3),");
  });
});

describe("jevPart, with how the call went (#516)", () => {
  const logged = { jevModel: "jev-1.14.0", call: { status: 200, ms: 2340, attempts: 1 } };

  test("names the model, the status and the time", () => {
    expect(jevPart({ ...base, reason: "risk", jev, ...logged })).toBe(`Jev level 4 by risk, ${answers}, jev-1.14.0, HTTP 200 in 2.3 s`);
  });

  test("an error keeps each Score's probabilities of an answer called empty, and counts the tries", () => {
    const call = { status: 200, ms: 61_000, attempts: 2 };
    const probabilities = { open: [0, 1, 0], reach: [0, 0, 0] };
    const route: Route = { ...base, reason: "jev-error", jev: null, error: "Jev's answer was empty", ...logged, call, probabilities };
    expect(jevPart(route)).toBe(
      "Jev error: Jev's answer was empty, routine default, open 0/1/0, reach 0/0/0, jev-1.14.0, HTTP 200 in 61 s after 2 tries",
    );
  });

  test("a call that never got a reply says so", () => {
    const route: Route = { ...base, reason: "jev-error", jev: null, error: "fetch failed", call: { status: null, ms: 3100, attempts: 3 } };
    expect(jevPart(route)).toBe("Jev error: fetch failed, routine default, no reply in 3.1 s after 3 tries");
  });

  test("the whole line still keeps its legs and minutes when it carries them", () => {
    const route: Route = { ...base, reason: "low-confidence", jev, ...logged };
    const existing = "Built on: claude-opus-5-5 / medium · 11 min claim→PR";
    const whole = builtOnLine({ existing, route, tokens: 1000, tools: 3 });
    expect(builtOnLine({ existing: whole, route, tokens: 2000, tools: 4 })).toMatch(
      /^Built on: claude-opus-5-5 \/ medium \(Jev level 4 by low confidence, risk 0\.82, .*reach 1\.1 at 0\.65 .*\) · build 2k tokens, 4 tool calls, orchestrator not counted · 11 min claim→PR$/,
    );
  });
});

describe("builtOnLine", () => {
  const route: Route = { ...base, reason: "risk", jev };
  const existing = "Members see: no.\nBuilt on: claude-opus-5-5 / medium · 11 min claim→PR\n";

  test("keeps the subagent's legs and minutes", () => {
    expect(builtOnLine({ existing, route, tokens: 65025, tools: 21 })).toBe(
      `Built on: claude-opus-5-5 / medium (Jev level 4 by risk, ${answers}) · build 65k tokens, 21 tool calls, orchestrator not counted · 11 min claim→PR`,
    );
  });

  test("a run that was escalated names both legs", () => {
    const legs = "claude-sonnet-5-5 / medium → claude-opus-5-5 / low (escalated)";
    expect(builtOnLine({ existing, route, tokens: 1, tools: 2, legs })).toContain(`Built on: ${legs} (`);
  });

  test("a line already in the whole format is rewritten, not stacked", () => {
    const whole = builtOnLine({ existing, route, tokens: 65025, tools: 21 });
    expect(builtOnLine({ existing: whole, route, tokens: 70000, tools: 22 })).toContain("build 70k tokens, 22 tool calls");
  });

  test("no line to rewrite is an error", () => {
    expect(() => builtOnLine({ existing: "nothing", route, tokens: 1, tools: 1 })).toThrow("no `Built on:` line");
  });
});

describe("replaceBuiltOn", () => {
  test("changes only that line", () => {
    const body = "Members see: yes.\nBuilt on: a / b · 3 min claim→PR\n\n## Summary\n$& stays";
    expect(replaceBuiltOn(body, "Built on: new")).toBe("Members see: yes.\nBuilt on: new\n\n## Summary\n$& stays");
  });
});
