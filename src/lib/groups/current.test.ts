/**
 * Which group a member is looking at. The rule has to survive a cookie that has
 * gone stale — a device remembers a group for a year, and a membership can end
 * in between — so the remembered value is a preference, never an authority.
 */
import { describe, expect, test } from "vitest";
import { membershipRemovals } from "@/db/schema";
import { addGroup, familyGroup, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { currentGroupId, groupChoice } from "./current";
import { MABRY_FAMILY } from "./memberships";

describe("the group a member is looking at", () => {
  test("a cookie naming a group the member has left falls back to one they are still in", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, TUESDAY);

    // While the membership stands, the device's choice is honoured.
    expect(await currentGroupId(db, grandma.id, String(friends.id))).toBe(friends.id);

    // Removed and not restored. The cookie still names Friends, but it is not
    // hers any more, so it is ignored rather than landing her on a board she
    // cannot see.
    await db
      .insert(membershipRemovals)
      .values({ groupId: friends.id, memberId: grandma.id, removedAt: THURSDAY });

    expect(await currentGroupId(db, grandma.id, String(friends.id))).toBe(family.id);
  });
});

describe("what the switcher offers", () => {
  test("a member of two groups gets both, in joined order, with the remembered one current", async () => {
    const { db, grandma } = await seedWeek2();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, THURSDAY);

    const choice = (await groupChoice(db, grandma.id, String(friends.id)))!;

    // Both offered, oldest membership first, so the list does not reorder itself
    // under someone as they switch.
    expect(choice.groups.map((g) => g.name)).toEqual([MABRY_FAMILY, "Friends"]);
    expect(choice.current.id).toBe(friends.id);
  });

  test("a member of one group is offered only that one, so the header is a name and not a control", async () => {
    const { db, jonah } = await seedWeek2();
    const family = await familyGroup(db);

    const choice = (await groupChoice(db, jonah.id, undefined))!;

    expect(choice.groups.map((g) => g.id)).toEqual([family.id]);
    expect(choice.current.id).toBe(family.id);
  });
});
