/**
 * The members console's delete over an injected `ConsoleRoute`. What the
 * wrapper adds over `members.ts` is the form parse, the sentence, and the
 * revalidate set, so that is what is asserted here; which members may be
 * deleted is `console.test.ts`'s job.
 */
import { describe, expect, test } from "vitest";
import { setMemberActive } from "@/lib/members/members";
import { form, routeFor } from "@/test/console";
import { pickAs, publishWeek2, THURSDAY } from "@/test/week-2";
import { deleteMember, deleteWarning } from "./console-edits";

describe("a commissioner's member edit from the console", () => {
  test("a delete answers the sentence and invalidates every screen the member was on", async () => {
    const { db, jonah, grandma, slate, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await setMemberActive(db, jonah, grandma.id, false);
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    const state = await deleteMember(route, form({ memberId: grandma.id }));

    expect(state).toEqual({ done: "Grandma is deleted." });
    expect(revalidated).toEqual(["/console/members", "/console/picks", "/week", "/live", "/results", "/leaderboard"]);
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
