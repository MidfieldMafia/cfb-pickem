/**
 * The Manage screen's forms as they post. What these wrappers add over the
 * `manage.ts` seam is small and worth pinning: who the actor is comes from the
 * session and never from the form, a refusal comes back as a sentence, a new
 * Magic Link comes back exactly once, and each edit refreshes the screens it
 * shows up on.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { memberships, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { form } from "@/test/console";
import { addGroup, familyGroup, joinAt, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { NotOrganizer } from "./manage";
import { groupForJoinLink } from "./join";
import { addExistingPerson, addPerson, removePerson, resetThisJoinLink, type ManageRoute } from "./manage-route";

function routeAs(db: Db, actor: Member) {
  const revalidated: string[] = [];
  const route: ManageRoute = {
    db,
    requireMember: async () => actor,
    revalidate: (path) => revalidated.push(path),
    appUrl: "https://slate.test",
    now: () => THURSDAY,
  };
  return { route, revalidated };
}

async function organized() {
  const fixture = await publishWeek2();
  const jo = await joinAt(fixture.db, fixture.jonah, "Aunt Jo", TUESDAY);
  await fixture.db.update(memberships).set({ role: "organizer" }).where(eq(memberships.memberId, jo.id));
  return { ...fixture, family: await familyGroup(fixture.db), jo };
}

describe("a Manage form", () => {
  test("adding answers with the new Magic Link and refreshes the Manage screen", async () => {
    const { db, jo, family } = await organized();
    const { route, revalidated } = routeAs(db, jo);

    const state = await addPerson(route, form({ groupId: family.id, displayName: "Cousin Al", phone: "+12565550199" }));

    expect(state.done).toBe("Cousin Al is in. Send them this link; it won't be shown again.");
    expect(state.link).toMatch(/^https:\/\/slate\.test\/m\/.+/);
    expect(revalidated).toContain(`/manage/${family.id}`);
  });

  test("a refusal comes back as a sentence, with no link", async () => {
    const { db, jonah, jo, family } = await organized();
    const { route } = routeAs(db, jo);

    expect(await removePerson(route, form({ groupId: family.id, memberId: jonah.id }))).toEqual({
      error: "Jonah is an organizer, so they stay.",
    });
  });

  test("someone who does not run the group gets no sentence at all", async () => {
    const { db, grandma, jo, family } = await organized();
    const { route } = routeAs(db, grandma);

    await expect(removePerson(route, form({ groupId: family.id, memberId: jo.id }))).rejects.toBeInstanceOf(NotOrganizer);
  });
});

describe("resetting the Join Link", () => {
  test("an organizer's reset stops the old link and says so", async () => {
    const { db, jo, family } = await organized();
    const { route, revalidated } = routeAs(db, jo);

    expect(await resetThisJoinLink(route, form({ groupId: family.id }))).toEqual({
      done: "The old Join Link has stopped working. Share the new one.",
    });
    expect(await groupForJoinLink(db, family.joinToken)).toBeNull();
    expect(revalidated).toContain(`/manage/${family.id}`);
  });

  test("a plain member cannot reset it", async () => {
    const { db, grandma, family } = await organized();
    const { route } = routeAs(db, grandma);

    await expect(resetThisJoinLink(route, form({ groupId: family.id }))).rejects.toBeInstanceOf(NotOrganizer);
    expect((await groupForJoinLink(db, family.joinToken))?.id).toBe(family.id);
  });
});

describe("a commissioner's Manage form", () => {
  test("adding someone already in the app answers without a link and refreshes the Manage screen", async () => {
    const { db, jonah, grandma } = await organized();
    const friends = await addGroup(db, "Friends");
    const { route, revalidated } = routeAs(db, jonah);

    expect(await addExistingPerson(route, form({ groupId: friends.id, memberId: grandma.id }))).toEqual({
      done: "Grandma is in Friends.",
    });
    expect(revalidated).toContain(`/manage/${friends.id}`);
    expect(await addExistingPerson(route, form({ groupId: friends.id }))).toEqual({ error: "Choose someone to add." });
  });
});
