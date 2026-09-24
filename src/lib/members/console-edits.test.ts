/**
 * The members console's delete and phone edit over an injected `ConsoleRoute`. What the
 * wrapper adds over `members.ts` is the form parse, the sentence, and the
 * revalidate set, so that is what is asserted here; which members may be
 * deleted is `console.test.ts`'s job.
 */
import { describe, expect, test } from "vitest";
import { setMemberActive } from "@/lib/members/members";
import { form, routeFor } from "@/test/console";
import { addGroup, familyGroup, joinGroup, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { deleteMember, deleteWarning, editPhone } from "./console-edits";

describe("a commissioner's member edit from the console", () => {
  test("a delete answers the sentence and invalidates every screen the member was on", async () => {
    const { db, jonah, grandma, slate, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await setMemberActive(db, jonah, grandma.id, false);
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    const state = await deleteMember(route, form({ memberId: grandma.id }));

    expect(state).toEqual({ done: "Grandma is deleted." });
    expect(revalidated).toEqual([
      "/console/members",
      "/console/picks",
      "/live",
      "/leaderboard",
    ]);
    expect(await db.query.members.findMany()).toHaveLength(1);
  });

  test("a refused delete is a sentence under the button, and nothing is invalidated", async () => {
    const { db, jonah, grandma } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    expect(await deleteMember(route, form({ memberId: grandma.id }))).toEqual({
      error: "Deactivate Grandma first.",
    });
    expect(await deleteMember(route, form({}))).toEqual({ error: "Missing memberId." });
    expect(revalidated).toEqual([]);
  });

  test("the warning says what goes with them", () => {
    expect(deleteWarning(0)).toBe("They have no Picks, so nothing else goes.");
    expect(deleteWarning(1)).toBe("Also deletes their 1 Pick and takes them off every board they were on.");
    expect(deleteWarning(12)).toBe("Also deletes their 12 Picks and takes them off every board they were on.");
  });
});

describe("a commissioner's phone edit from the console", () => {
  test("saving answers the sentence and refreshes the Members page and each of their groups' Manage screens", async () => {
    const { db, jonah, grandma } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, TUESDAY);
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    expect(await editPhone(route, form({ memberId: grandma.id, phone: "+12565550140" }))).toEqual({
      done: "Grandma's phone number is saved.",
    });
    const family = await familyGroup(db);
    expect(revalidated).toEqual(["/console/members", `/manage/${family.id}`, `/manage/${friends.id}`]);
    expect(await editPhone(route, form({ memberId: grandma.id, phone: "" }))).toEqual({
      done: "Grandma's phone number is cleared.",
    });
  });

  test("a number someone else has is a sentence under the field", async () => {
    const { db, jonah, grandma } = await publishWeek2();
    const { route } = routeFor(db, jonah, THURSDAY);
    await editPhone(route, form({ memberId: grandma.id, phone: "+12565550140" }));

    expect(await editPhone(route, form({ memberId: jonah.id, phone: "+12565550140" }))).toEqual({
      error: "That phone number already belongs to Grandma.",
    });
  });
});
