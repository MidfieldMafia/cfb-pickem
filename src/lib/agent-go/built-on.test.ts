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
