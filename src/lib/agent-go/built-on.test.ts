import { describe, expect, test } from "vitest";
import { builtOnLine, formatTokens, jevPart, replaceBuiltOn } from "./built-on";
import type { Route } from "./route";

const base = { level: 4, model: "opus", effort: "medium" } as const;
const jev = { level: 5, confidence: 0.4, inputTokens: 1113, outputTokens: 17 } as const;

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
  test("a trusted level, a moved one and an error", () => {
    expect(jevPart({ ...base, reason: "jev", jev: { ...jev, level: 4, confidence: 0.82 } })).toBe(
      "Jev level 4, confidence 0.82, 1.1k tokens",
    );
    expect(jevPart({ ...base, reason: "low-confidence", jev })).toBe(
      "Jev level 5, confidence 0.4, 1.1k tokens, below 0.7 so level 4",
    );
    expect(jevPart({ ...base, reason: "jev-error", jev: null, error: "HTTP 500 from Jev" })).toBe(
      "Jev error: HTTP 500 from Jev, routine default",
    );
  });
});

describe("jevPart, with what Jev answered (#516)", () => {
  const logged = {
    probabilities: [0.1, 0.1, 0.15, 0.25, 0.4],
    jevModel: "jev-1.14.0",
    call: { status: 200, ms: 2340, attempts: 1 },
  };

  test("names the five probabilities, the model, the status and the time", () => {
    expect(jevPart({ ...base, reason: "low-confidence", jev: { ...jev, confidence: 0 }, ...logged })).toBe(
      "Jev level 5, confidence 0, 1.1k tokens, below 0.7 so level 4, levels 0.1/0.1/0.15/0.25/0.4, jev-1.14.0, HTTP 200 in 2.3 s",
    );
  });

  test("rounds each probability to two places", () => {
    const probabilities = [0.1234, 0.30000000000000004, 0.5766, 0, 0];
    expect(jevPart({ ...base, reason: "jev", jev, ...logged, probabilities })).toContain("levels 0.12/0.3/0.58/0/0,");
  });

  test("an error keeps the probabilities of an answer called empty, and counts the tries", () => {
    const call = { status: 200, ms: 61_000, attempts: 2 };
    const route: Route = { ...base, reason: "jev-error", jev: null, error: "Jev's answer was empty", ...logged, call, probabilities: [0, 0, 0, 0, 0] };
    expect(jevPart(route)).toBe(
      "Jev error: Jev's answer was empty, routine default, levels 0/0/0/0/0, jev-1.14.0, HTTP 200 in 61 s after 2 tries",
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
      /^Built on: claude-opus-5-5 \/ medium \(Jev level 5.*levels 0\.1\/.*\) · build 2k tokens, 4 tool calls, orchestrator not counted · 11 min claim→PR$/,
    );
  });
});

describe("builtOnLine", () => {
  const route: Route = { ...base, reason: "low-confidence", jev };
  const existing = "Members see: no.\nBuilt on: claude-opus-5-5 / medium · 11 min claim→PR\n";

  test("keeps the subagent's legs and minutes", () => {
    expect(builtOnLine({ existing, route, tokens: 65025, tools: 21 })).toBe(
      "Built on: claude-opus-5-5 / medium (Jev level 5, confidence 0.4, 1.1k tokens, below 0.7 so level 4) · build 65k tokens, 21 tool calls, orchestrator not counted · 11 min claim→PR",
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
