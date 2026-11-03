/**
 * `/go?group=<id>&to=<path>` (#529): the link a push opens. It switches the
 * device's group only to one that is still the member's, and goes only to a
 * path in this app.
 */
import { describe, expect, test } from "vitest";
import { membershipRemovals } from "@/db/schema";
import { addGroup, familyGroup, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { goTarget, sameOriginPath } from "./go";

describe("the group a /go link switches to", () => {
  test("one of the member's groups is switched to", async () => {
    const { db, grandma } = await seedWeek2();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, TUESDAY);

    expect(await goTarget(db, grandma.id, String(friends.id), "/chat")).toEqual({ group: friends.id, path: "/chat" });
    expect((await goTarget(db, grandma.id, String((await familyGroup(db)).id), "/chat")).group).toBe((await familyGroup(db)).id);
  });

  test("a group that is not the member's, or no longer is, switches nothing and still opens the path", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jonah, TUESDAY);
    const left = await addGroup(db, "Left");
    await joinGroup(db, left, grandma, TUESDAY);
    await db.insert(membershipRemovals).values({ groupId: left.id, memberId: grandma.id, removedAt: THURSDAY });

    expect(await goTarget(db, grandma.id, String(friends.id), "/chat")).toEqual({ group: null, path: "/chat" });
    expect(await goTarget(db, grandma.id, String(left.id), "/chat")).toEqual({ group: null, path: "/chat" });
    expect(await goTarget(db, grandma.id, "nonsense", "/chat")).toEqual({ group: null, path: "/chat" });
    expect(await goTarget(db, grandma.id, null, "/chat")).toEqual({ group: null, path: "/chat" });
  });

  test("signed out, nothing is switched", async () => {
    const { db } = await seedWeek2();
    const family = await familyGroup(db);
    expect(await goTarget(db, null, String(family.id), "/leaderboard?week=9")).toEqual({ group: null, path: "/leaderboard?week=9" });
  });
});

describe("the path a /go link opens", () => {
  test("a path in this app is kept, with its query and hash", () => {
    expect(sameOriginPath("/leaderboard?week=9")).toBe("/leaderboard?week=9");
    expect(sameOriginPath("/live?game=3#sheet")).toBe("/live?game=3#sheet");
    expect(sameOriginPath("/chat")).toBe("/chat");
  });

  test("anything that could leave the app opens the home screen instead", () => {
    for (const to of [
      "https://evil.example/chat",
      "//evil.example/chat",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "chat",
      "",
      null,
      "/%0d%0aSet-Cookie:x=1",
    ]) {
      const path = sameOriginPath(to);
      expect(path === "/" || (path.startsWith("/") && !path.startsWith("//")), String(to)).toBe(true);
      expect(path, String(to)).not.toMatch(/evil|javascript|[\r\n]/);
    }
    expect(sameOriginPath("https://evil.example/chat")).toBe("/");
    expect(sameOriginPath("//evil.example/chat")).toBe("/");
  });
});
