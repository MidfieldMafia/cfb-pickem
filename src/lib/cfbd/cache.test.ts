import { describe, expect, test } from "vitest";
import { cachingCfbd } from "./cache";
import { recordedCfbd } from "./recorded";

describe("shared CollegeFootballData cache", () => {
  test("repeat reads inside the ttl cost one call; invalidate forces the next read through", async () => {
    const inner = recordedCfbd("2026-week-2");
    let clock = 0;
    const cfbd = cachingCfbd(inner, 1000, () => clock);

    await cfbd.games({ year: 2026, week: 2 });
    await cfbd.games({ year: 2026, week: 2 });
    expect(inner.calls).toBe(1);

    await cfbd.games({ year: 2026, week: 3 });
    expect(inner.calls).toBe(2);

    clock = 1001;
    await cfbd.games({ year: 2026, week: 2 });
    expect(inner.calls).toBe(3);

    cfbd.invalidate();
    await cfbd.games({ year: 2026, week: 2 });
    expect(inner.calls).toBe(4);
  });
});
