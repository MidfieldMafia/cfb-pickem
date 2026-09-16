/**
 * The commissioner's view over every group: the console's Groups list, starting
 * a group without joining it, deleting one, and adding a new person to the group
 * they choose. What an organizer may do inside a group is `manage.test.ts`'s.
 *
 * Built on the published Week 2 fixture, where Jonah (a commissioner) and
 * Grandma are both in Mabry Family.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { groups, membershipRemovals, members, memberships, picks } from "@/db/schema";
import { exchangeToken } from "@/lib/members/auth";
import { InvalidMember } from "@/lib/members/members";
import { Refusal } from "@/lib/refusal";
import { addGroup, familyGroup, joinAt, joinGroup, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { addMember, createGroup, deleteGroup, groupsByMember, listGroups } from "./console";
import { manageGroup, removeFromGroup } from "./manage";
import { memberGroups } from "./memberships";

/** Mabry Family as the fixture has it, plus Friends: Aunt Jo organizing, Grandma also playing. */
async function twoGroups() {
  const fixture = await publishWeek2();
  const { db, jonah, grandma } = fixture;
  const family = await familyGroup(db);
  const jo = await joinAt(db, jonah, "Aunt Jo", TUESDAY);
  const friends = await addGroup(db, "Friends");
  await joinGroup(db, friends, jo, TUESDAY, "organizer");
  await joinGroup(db, friends, grandma, TUESDAY);
  return { ...fixture, family, friends, jo };
}

describe("the Groups list", () => {
  test("each group's name, how many are in it now, and its organizers", async () => {
    const { db, jonah, jo, family, friends } = await twoGroups();
    // A removed member is not in the group, so is not counted.
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), jo.id, THURSDAY);

    expect(await listGroups(db, jonah)).toEqual([
      { id: family.id, name: "Mabry Family", members: 2, organizers: ["Jonah"], leftWithoutGroup: 1 },
      { id: friends.id, name: "Friends", members: 2, organizers: ["Aunt Jo"], leftWithoutGroup: 1 },
    ]);
  });

  test("a group with nobody in it is listed with no organizers", async () => {
    const { db, jonah } = await publishWeek2();
    const empty = await createGroup(db, jonah, "Empty");

    expect((await listGroups(db, jonah)).find((g) => g.id === empty.id)).toEqual({
      id: empty.id,
      name: "Empty",
      members: 0,
      organizers: [],
      leftWithoutGroup: 0,
    });
  });
});

describe("creating a group", () => {
  test("a commissioner creates a group without joining it, and it has no organizer", async () => {
    const { db, jonah } = await publishWeek2();

    const group = await createGroup(db, jonah, "  Office Pool ");

    expect(group.name).toBe("Office Pool");
    expect(await db.query.memberships.findMany({ where: eq(memberships.groupId, group.id) })).toEqual([]);
    expect((await memberGroups(db, jonah.id)).map((g) => g.group.name)).toEqual(["Mabry Family"]);
    // A commissioner runs it all the same.
    expect((await manageGroup(db, jonah, group.id)).commissioner).toBe(true);
  });

  test("every group gets its own Join Link token, and a blank name is refused", async () => {
    const { db, jonah } = await publishWeek2();

    const a = await createGroup(db, jonah, "Pool");
    const b = await createGroup(db, jonah, "Pool");

    expect(a.joinToken).not.toBe(b.joinToken);
    expect(a.joinToken.length).toBeGreaterThan(20);
    await expect(createGroup(db, jonah, "   ")).rejects.toBeInstanceOf(Refusal);
  });
});

describe("deleting a group", () => {
  test("the group and its memberships go; the people and their picks stay", async () => {
    const { db, jonah, grandma, jo, friends, slate, michigan } = await twoGroups();
    await pickAs(db, jo, slate, michigan, michigan.homeTeamId, THURSDAY);
    await removeFromGroup(db, await manageGroup(db, jo, friends.id), grandma.id, THURSDAY);

    const deleted = await deleteGroup(db, jonah, friends.id, "Friends");

    expect(deleted).toEqual({ name: "Friends", leftWithoutGroup: 0 });
    expect(await db.query.groups.findFirst({ where: eq(groups.id, friends.id) })).toBeUndefined();
    expect(await db.query.memberships.findMany({ where: eq(memberships.groupId, friends.id) })).toEqual([]);
    expect(await db.query.membershipRemovals.findMany({ where: eq(membershipRemovals.groupId, friends.id) })).toEqual(
      [],
    );
    expect((await db.select().from(members)).map((m) => m.displayName)).toEqual(["Jonah", "Grandma", "Aunt Jo"]);
    expect(await db.query.picks.findMany({ where: eq(picks.memberId, jo.id) })).toHaveLength(1);
    // Mabry Family is untouched.
    expect((await memberGroups(db, grandma.id)).map((g) => g.group.name)).toEqual(["Mabry Family"]);
  });

  test("someone whose only group it was keeps their row, their picks, and their Magic Link", async () => {
    const { db, jonah, jo, family, friends, slate, michigan } = await twoGroups();
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), jo.id, THURSDAY);
    await pickAs(db, jo, slate, michigan, michigan.homeTeamId, THURSDAY);

    const deleted = await deleteGroup(db, jonah, friends.id, "Friends");

    expect(deleted.leftWithoutGroup).toBe(1);
    expect(await memberGroups(db, jo.id)).toEqual([]);
    expect(await db.query.picks.findMany({ where: eq(picks.memberId, jo.id) })).toHaveLength(1);
    expect((await exchangeToken(db, jo.token))?.member.id).toBe(jo.id);
  });

  test("the group's name must be typed to delete it, and nothing goes when it is not", async () => {
    const { db, jonah, friends } = await twoGroups();

    await expect(deleteGroup(db, jonah, friends.id, "friends")).rejects.toThrow("Type Friends to delete it.");
    await expect(deleteGroup(db, jonah, friends.id, "")).rejects.toBeInstanceOf(Refusal);
    await expect(deleteGroup(db, jonah, 9999, "Friends")).rejects.toThrow("No such group.");
    expect(await db.query.memberships.findMany({ where: eq(memberships.groupId, friends.id) })).toHaveLength(2);
  });
});

describe("adding someone new from the Members page", () => {
  test("they go into the group chosen, joined now, and not into Mabry Family", async () => {
    const { db, jonah, friends } = await twoGroups();

    const added = await addMember(db, jonah, friends.id, { displayName: "Cousin Al", phone: "+12565550199" }, THURSDAY);

    expect((await memberGroups(db, added.id)).map((g) => [g.group.name, g.role, g.joinedAt])).toEqual([
      ["Friends", "member", THURSDAY],
    ]);
    expect((await exchangeToken(db, added.token))?.member.displayName).toBe("Cousin Al");
  });

  test("the phone number is required, and one already in the app names whose it is", async () => {
    const { db, jonah, grandma, friends } = await twoGroups();
    await db.update(members).set({ phone: "+12565550140" }).where(eq(members.id, grandma.id));

    await expect(addMember(db, jonah, friends.id, { displayName: "Nana", phone: "" }, THURSDAY)).rejects.toThrow(
      "Enter their phone number.",
    );
    await expect(
      addMember(db, jonah, friends.id, { displayName: "Nana", phone: " +12565550140 " }, THURSDAY),
    ).rejects.toThrow(new InvalidMember("That phone number already belongs to Grandma."));
  });
});

describe("the Members page's groups column", () => {
  test("each person's groups now, organizer roles marked, removed groups left out", async () => {
    const { db, jonah, grandma, jo, family, friends } = await twoGroups();
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), jo.id, THURSDAY);

    const byMember = await groupsByMember(db, jonah);

    expect(byMember.get(jonah.id)).toEqual([{ id: family.id, name: "Mabry Family", role: "organizer" }]);
    expect(byMember.get(grandma.id)).toEqual([
      { id: family.id, name: "Mabry Family", role: "member" },
      { id: friends.id, name: "Friends", role: "member" },
    ]);
    expect(byMember.get(jo.id)).toEqual([{ id: friends.id, name: "Friends", role: "organizer" }]);
  });
});
