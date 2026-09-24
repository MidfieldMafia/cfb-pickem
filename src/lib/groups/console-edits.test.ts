/**
 * The console's group edits as its forms post them, over an injected
 * `ConsoleRoute`. What these add over `console.ts` is the form parse, the
 * sentence, and the screens refreshed, so that is what is asserted; which
 * groups may be deleted and who ends up where is `console.test.ts`'s job.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { memberships } from "@/db/schema";
import { form, routeFor } from "@/test/console";
import { addGroup, joinAt, joinGroup, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { addPersonToGroup, createGroupEdit, deleteGroupEdit, leftWithoutGroupWarning } from "./console-edits";
import { memberGroups } from "./memberships";

const BOARDS = ["/leaderboard", "/live"];

describe("a commissioner's group edit from the console", () => {
  test("creating answers with the sentence and refreshes the Groups list", async () => {
    const { db, jonah } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    expect(await createGroupEdit(route, form({ name: "Office Pool" }))).toEqual({
      done: "Office Pool is created. Open it to add people.",
    });
    expect(revalidated).toEqual(["/console/groups"]);
    expect(await createGroupEdit(route, form({ name: " " }))).toEqual({ error: "A group name is 1 to 40 characters." });
  });

  test("deleting says who is left without a group and refreshes every screen the group was on", async () => {
    const { db, jonah, grandma } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const jo = await joinAt(db, jonah, "Aunt Jo", TUESDAY);
    // Aunt Jo plays only in Friends; Grandma in both.
    await db.delete(memberships).where(eq(memberships.memberId, jo.id));
    await joinGroup(db, friends, jo, TUESDAY, "organizer");
    await joinGroup(db, friends, grandma, TUESDAY);
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    const state = await deleteGroupEdit(route, form({ groupId: friends.id, confirm: "Friends" }));

    expect(state).toEqual({ done: "Friends is deleted. 1 person is left without a group; they keep their picks." });
    expect(revalidated).toEqual(["/console/groups", "/console/members", `/manage/${friends.id}`, ...BOARDS]);
  });

  test("a delete without the name typed is a sentence, and nothing is refreshed", async () => {
    const { db, jonah } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    expect(await deleteGroupEdit(route, form({ groupId: friends.id, confirm: "Frends" }))).toEqual({
      error: "Type Friends to delete it.",
    });
    expect(await deleteGroupEdit(route, form({ confirm: "Friends" }))).toEqual({ error: "Missing groupId." });
    expect(revalidated).toEqual([]);
  });

  test("adding someone new from the Members page puts them in the group chosen", async () => {
    const { db, jonah } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    const state = await addPersonToGroup(
      route,
      form({ groupId: friends.id, displayName: "Cousin Al", phone: "+12565550199" }),
    );

    expect(state).toEqual({ done: "Cousin Al is in Friends. Copy their link below and send it to them." });
    expect(revalidated).toEqual(["/console/members", "/console/groups", `/manage/${friends.id}`, ...BOARDS]);
    const [al] = (await db.query.members.findMany()).filter((m) => m.displayName === "Cousin Al");
    expect((await memberGroups(db, al.id)).map((g) => g.group.name)).toEqual(["Friends"]);
    expect(await addPersonToGroup(route, form({ displayName: "Nana", phone: "+12565550198" }))).toEqual({
      error: "Choose a group.",
    });
  });

  test("the warning beside Delete counts who would be left without a group", () => {
    expect(leftWithoutGroupWarning(0)).toBe("Nobody is left without a group.");
    expect(leftWithoutGroupWarning(1)).toBe("1 person is left without a group; they keep their picks.");
    expect(leftWithoutGroupWarning(3)).toBe("3 people are left without a group; they keep their picks.");
  });
});
