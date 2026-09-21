/**
 * The Join Link, Start a group, and You screen forms as they post. What these
 * add over `join.ts` is where each one lands, what it signs in and which group
 * it shows — and that a refusal comes back as a sentence with nothing signed in.
 */
import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { form } from "@/test/console";
import { addGroup, familyGroup, publishWeek2, THURSDAY } from "@/test/week-2";
import { joinFromForm, leaveFromForm, startFromForm, type JoinRoute } from "./join-route";

function routeAs(db: Db, actor: Member | null) {
  const seen = { sessions: [] as string[], groups: [] as number[], revalidated: [] as string[] };
  const route: JoinRoute = {
    db,
    currentMember: async () => actor,
    signIn: async (sessionId) => void seen.sessions.push(sessionId),
    showGroup: async (groupId) => void seen.groups.push(groupId),
    revalidate: (path) => void seen.revalidated.push(path),
    now: () => THURSDAY,
  };
  return { route, seen };
}

const PERSON = { displayName: "Cousin Al", phone: "+12565550142", avatarId: "pennants-04" };

describe("the Join Link form", () => {
  test("signed out: signs the new person in, shows them the group, and goes on to How to play", async () => {
    const { db } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const { route, seen } = routeAs(db, null);

    const outcome = await joinFromForm(route, form({ token: friends.joinToken, ...PERSON }));

    expect(outcome).toEqual({ to: "/rules?setup=1" });
    expect(seen.sessions).toHaveLength(1);
    expect(seen.groups).toEqual([friends.id]);
  });

  test("signed out with a number already in the app: the sentence, and nobody signed in", async () => {
    const { db, grandma } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const { route, seen } = routeAs(db, null);

    const outcome = await joinFromForm(route, form({ token: friends.joinToken, ...PERSON, phone: grandma.phone! }));

    expect(outcome).toEqual({
      error: "This number already plays in another group. Text yourself your link below, open it, then open this link again.",
    });
    expect(seen.sessions).toEqual([]);
  });

  test("signed in: one tap joins, shows the group, and lands on the boards", async () => {
    const { db, grandma } = await publishWeek2();
    const friends = await addGroup(db, "Friends");
    const { route, seen } = routeAs(db, grandma);

    expect(await joinFromForm(route, form({ token: friends.joinToken }))).toEqual({ to: "/" });
    expect(seen).toMatchObject({ sessions: [], groups: [friends.id] });
  });
});

describe("the Start a group form", () => {
  test("signed out: How to play first, then the organizer screen for the new group", async () => {
    const { db } = await publishWeek2();
    const { route, seen } = routeAs(db, null);

    const outcome = await startFromForm(route, form({ groupName: "Tailgate Crew", ...PERSON }));

    const [groupId] = seen.groups;
    expect(outcome).toEqual({ to: `/rules?setup=1&group=${groupId}` });
    expect(seen.sessions).toHaveLength(1);
  });

  test("signed in: straight to the organizer screen", async () => {
    const { db, grandma } = await publishWeek2();
    const { route, seen } = routeAs(db, grandma);

    const outcome = await startFromForm(route, form({ groupName: "Bridge Club" }));

    expect(outcome).toEqual({ to: `/start/${seen.groups[0]}` });
    expect(seen.sessions).toEqual([]);
  });

  test("a group name that does not pass says so, and nothing is shown", async () => {
    const { db } = await publishWeek2();
    const { route, seen } = routeAs(db, null);

    expect(await startFromForm(route, form({ groupName: "", ...PERSON }))).toEqual({
      error: "A group name is 1 to 40 characters.",
    });
    expect(seen.groups).toEqual([]);
  });
});

describe("leaving from the You screen", () => {
  test("says so, and refreshes the screens the group was on", async () => {
    const { db, grandma } = await publishWeek2();
    const family = await familyGroup(db);
    const { route, seen } = routeAs(db, grandma);

    expect(await leaveFromForm(route, form({ groupId: family.id }))).toEqual({ done: "You left Mabry Family." });
    expect(seen.revalidated).toEqual(expect.arrayContaining(["/you", "/leaderboard"]));
  });

  test("the last organizer's refusal comes back as a sentence", async () => {
    const { db } = await publishWeek2();
    const { route: signedOut } = routeAs(db, null);
    await startFromForm(signedOut, form({ groupName: "Tailgate Crew", ...PERSON }));
    const founder = (await db.query.members.findFirst({ where: (m, { eq }) => eq(m.displayName, "Cousin Al") }))!;
    const group = (await db.query.groups.findFirst({ where: (g, { eq }) => eq(g.name, "Tailgate Crew") }))!;
    const { route } = routeAs(db, founder);

    expect(await leaveFromForm(route, form({ groupId: group.id }))).toEqual({
      error: "Make someone else an organizer before you leave.",
    });
  });
});
