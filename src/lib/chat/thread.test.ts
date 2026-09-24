import { describe, expect, test } from "vitest";
import type { ChatMessageJson } from "./json";
import { chatTimeLabel, threadRows } from "./thread";

const ME = 1;
const DANA = 2;
const MARCUS = 3;

let nextId = 0;
function msg(memberId: number, at: string, text = "…"): ChatMessageJson {
  nextId += 1;
  return { id: nextId, memberId, text, createdAt: at, reactions: [], mine: null };
}

const shape = (rows: ReturnType<typeof threadRows>) => rows.map((r) => [r.message.memberId, r.mine, r.head, r.tail]);

describe("grouping the thread by sender", () => {
  test("a run by one sender has one name at its top and one pennant at its foot", () => {
    const rows = threadRows(
      [
        msg(DANA, "2026-09-12T17:00:00Z"),
        msg(DANA, "2026-09-12T17:01:00Z"),
        msg(DANA, "2026-09-12T17:02:00Z"),
        msg(MARCUS, "2026-09-12T17:03:00Z"),
      ],
      ME,
    );
    expect(shape(rows)).toEqual([
      [DANA, false, true, false],
      [DANA, false, false, false],
      [DANA, false, false, true],
      [MARCUS, false, true, true],
    ]);
  });

  test("the viewer's own messages are marked as theirs and group the same way", () => {
    const rows = threadRows([msg(ME, "2026-09-12T17:00:00Z"), msg(ME, "2026-09-12T17:00:30Z"), msg(DANA, "2026-09-12T17:01:00Z")], ME);
    expect(shape(rows)).toEqual([
      [ME, true, true, false],
      [ME, true, false, true],
      [DANA, false, true, true],
    ]);
  });

  test("a long pause starts a new run, with its own time, even from the same sender", () => {
    const rows = threadRows([msg(DANA, "2026-09-12T17:00:00Z"), msg(DANA, "2026-09-12T17:20:00Z")], ME);
    expect(shape(rows)).toEqual([
      [DANA, false, true, true],
      [DANA, false, true, true],
    ]);
  });
});

describe("the time over a run", () => {
  // Saturday 2026-09-12, 3:41 PM in Central time.
  const SATURDAY = "2026-09-12T20:41:00Z";

  test("is the time alone on the same day", () => {
    expect(chatTimeLabel(SATURDAY, new Date("2026-09-12T23:00:00Z"))).toBe("3:41 PM");
  });

  test("adds the weekday within the week", () => {
    expect(chatTimeLabel(SATURDAY, new Date("2026-09-15T15:00:00Z"))).toBe("Sat 3:41 PM");
  });

  test("adds the date after that", () => {
    expect(chatTimeLabel(SATURDAY, new Date("2026-09-25T15:00:00Z"))).toBe("Sep 12, 3:41 PM");
  });

  test("reads the day in Central time, not UTC", () => {
    // 01:30Z Sunday is still Saturday evening in Central time.
    expect(chatTimeLabel("2026-09-13T01:30:00Z", new Date("2026-09-13T02:00:00Z"))).toBe("8:30 PM");
  });
});
