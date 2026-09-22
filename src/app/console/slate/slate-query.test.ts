import { describe, expect, test } from "vitest";
import { slateQuery } from "./slate-query";

const DEFAULTS = { week: 2, filter: "all", fbsOnly: true, q: "", sort: "kickoff", dir: "asc" } as const;

describe("the slate builder's query", () => {
  test("a default view carries only the week", () => {
    expect(slateQuery(DEFAULTS).href()).toBe("/console/slate?week=2");
  });

  test("every non-default field is written, always in the same order", () => {
    const href = slateQuery({ week: 3, filter: "sec", fbsOnly: false, q: "ohio state", sort: "spread", dir: "desc" }).href();
    expect(href).toBe("/console/slate?week=3&filter=sec&fbs=0&q=ohio+state&sort=spread&dir=desc");
  });

  test("with() changes one field and keeps the rest", () => {
    const view = slateQuery({ ...DEFAULTS, filter: "ranked", q: "michigan", sort: "spread" });
    expect(view.with({ filter: "all" }).href()).toBe("/console/slate?week=2&q=michigan&sort=spread");
    expect(view.with({ fbsOnly: false }).href()).toBe("/console/slate?week=2&filter=ranked&fbs=0&q=michigan&sort=spread");
  });

  test("a sort click starts ascending, and a repeat click flips direction", () => {
    const kickoff = slateQuery(DEFAULTS);
    expect(kickoff.sortedBy("spread").href()).toBe("/console/slate?week=2&sort=spread");
    expect(kickoff.sortedBy("kickoff").href()).toBe("/console/slate?week=2&dir=desc");
    // Descending on the active column flips back to ascending, which is the default and so drops out.
    expect(kickoff.sortedBy("kickoff").sortedBy("kickoff").href()).toBe("/console/slate?week=2");
    // A first click on the other column starts ascending even when this one was descending.
    expect(kickoff.sortedBy("kickoff").sortedBy("spread").href()).toBe("/console/slate?week=2&sort=spread");
  });
});
