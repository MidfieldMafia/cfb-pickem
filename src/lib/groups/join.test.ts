/**
 * People getting into groups on their own: through a group's Join Link, by
 * starting a group, and back out again by leaving one. Every refusal the spec
 * names is enforced here against the acting person, not by what a screen draws.
 *
 * Built on the published Week 2 fixture: Jonah (commissioner, Mabry Family's
 * organizer) and Grandma (a plain member), both in Mabry Family.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { membershipRemovals, members, memberships } from "@/db/schema";
import { getSession } from "@/lib/members/auth";
import { Refusal } from "@/lib/refusal";
import { addGroup, familyGroup, joinGroup, publishWeek2, SUNDAY, THURSDAY, TUESDAY } from "@/test/week-2";
import {
  groupForJoinLink,
  joinLinkFor,
  joinSignedIn,
  joinSignedOut,
  joinStanding,
  leaveGroup,
  startGroupSignedIn,
  startGroupSignedOut,
} from "./join";
import { addExistingToGroup, manageGroup, manageView, removeFromGroup, resetJoinLink, restoreToGroup } from "./manage";
import { groupBoard, memberGroups } from "./memberships";

const COUSIN = { displayName: "Cousin Al", phone: "+12565550142", avatarId: "pennants-04" };

async function withFriends() {
  const fixture = await publishWeek2();
  const friends = await addGroup(fixture.db, "Friends");
  return { ...fixture, family: await familyGroup(fixture.db), friends };
}

describe("the Join Link", () => {
  test("is the app URL, a path of its own, and the group's token", async () => {
    const { friends } = await withFriends();

    expect(joinLinkFor(friends, "https://slate.test/")).toBe(`https://slate.test/join/${friends.joinToken}`);
  });

  test("finds its group, and nothing once reset", async () => {
    const { db, jonah, friends } = await withFriends();
    expect((await groupForJoinLink(db, friends.joinToken))?.id).toBe(friends.id);

    const reset = await resetJoinLink(db, await manageGroup(db, jonah, friends.id));

    expect(reset.joinToken).not.toBe(friends.joinToken);
    expect(await groupForJoinLink(db, friends.joinToken)).toBeNull();
    expect((await groupForJoinLink(db, reset.joinToken))?.id).toBe(friends.id);
  });
});

describe("joining signed out", () => {
  test("sets up a new person in the group, joined now, signed in, with their name and pennant done", async () => {
    const { db, friends } = await withFriends();

    const arrival = await joinSignedOut(db, friends.joinToken, COUSIN, THURSDAY);

    expect(arrival.group.id).toBe(friends.id);
    expect(arrival.member).toMatchObject({ displayName: "Cousin Al", avatarId: "pennants-04", phone: "+12565550142" });
    expect(arrival.member.welcomedAt).not.toBeNull();
    expect((await getSession(db, arrival.sessionId))?.id).toBe(arrival.member.id);
    expect(await memberGroups(db, arrival.member.id)).toEqual([
      expect.objectContaining({ group: expect.objectContaining({ id: friends.id }), role: "member", joinedAt: THURSDAY }),
    ]);
  });

  test("a phone number already in the app is refused, and nobody is added", async () => {
    const { db, grandma, friends } = await withFriends();
    const before = await db.select().from(members);

    const joining = joinSignedOut(db, friends.joinToken, { ...COUSIN, phone: grandma.phone! }, THURSDAY);

    await expect(joining).rejects.toBeInstanceOf(Refusal);
    await expect(joining).rejects.toThrow(
      "This number already plays in another group. Text yourself your link below, open it, then open this link again.",
    );
    expect(await db.select().from(members)).toHaveLength(before.length);
  });

  test("a phone number is required, as is a pennant", async () => {
    const { db, friends } = await withFriends();

    await expect(joinSignedOut(db, friends.joinToken, { ...COUSIN, phone: " " }, THURSDAY)).rejects.toThrow(
      "Enter your phone number.",
    );
    await expect(joinSignedOut(db, friends.joinToken, { ...COUSIN, avatarId: "nope" }, THURSDAY)).rejects.toThrow(
      "Pick one of the pennants.",
    );
  });

  test("a reset link fails, and nobody is added", async () => {
    const { db, jonah, friends } = await withFriends();
    await resetJoinLink(db, await manageGroup(db, jonah, friends.id));
    const before = await db.select().from(members);

    await expect(joinSignedOut(db, friends.joinToken, COUSIN, THURSDAY)).rejects.toThrow(
      "This link was reset. Ask your organizer for the new one.",
    );
    expect(await db.select().from(members)).toHaveLength(before.length);
  });
});

describe("joining signed in", () => {
  test("puts someone already playing into the group, joined now, so no earlier week counts there", async () => {
    const { db, grandma, friends } = await withFriends();

    const group = await joinSignedIn(db, grandma, friends.joinToken, SUNDAY);

    expect(group.id).toBe(friends.id);
    expect(await joinStanding(db, grandma.id, friends.id)).toBe("in");
    const board = await groupBoard(db, friends.id);
    expect(board.map((m) => [m.id, m.joinedAt])).toEqual([[grandma.id, SUNDAY]]);
  });

  test("a current member is simply in it, with nothing written", async () => {
    const { db, grandma, family } = await withFriends();
    const before = await db.select().from(memberships);

    expect((await joinSignedIn(db, grandma, family.joinToken, SUNDAY)).id).toBe(family.id);
    expect(await db.select().from(memberships)).toEqual(before);
  });

  test("someone removed is refused: only an organizer brings them back", async () => {
    const { db, jonah, grandma, family } = await withFriends();
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), grandma.id, TUESDAY);
    expect(await joinStanding(db, grandma.id, family.id)).toBe("removed");

    await expect(joinSignedIn(db, grandma, family.joinToken, THURSDAY)).rejects.toThrow(
      "You were removed from Mabry Family. Ask your organizer to add you back.",
    );
    expect(await joinStanding(db, grandma.id, family.id)).toBe("removed");
  });

  test("someone who left rejoins through the link with their original joined-at", async () => {
    const { db, grandma, family } = await withFriends();
    const [original] = await db.select().from(memberships).where(eq(memberships.memberId, grandma.id));
    await leaveGroup(db, grandma, family.id, TUESDAY);
    expect(await joinStanding(db, grandma.id, family.id)).toBe("left");

    await joinSignedIn(db, grandma, family.joinToken, THURSDAY);

    expect(await joinStanding(db, grandma.id, family.id)).toBe("in");
    const board = await groupBoard(db, family.id);
    expect(board.find((m) => m.id === grandma.id)).toMatchObject({
      joinedAt: original.joinedAt,
      removals: [{ removedAt: TUESDAY, restoredAt: THURSDAY, kind: "left" }],
    });
  });

  test("a reset link fails", async () => {
    const { db, jonah, grandma, friends } = await withFriends();
    await resetJoinLink(db, await manageGroup(db, jonah, friends.id));

    await expect(joinSignedIn(db, grandma, friends.joinToken, THURSDAY)).rejects.toThrow(
      "This link was reset. Ask your organizer for the new one.",
    );
  });

  test("someone never in the group stands as never", async () => {
    const { db, grandma, friends } = await withFriends();

    expect(await joinStanding(db, grandma.id, friends.id)).toBe("never");
  });
});

describe("starting a group", () => {
  test("signed out: a new person, a new group with a Join Link, and the creator its organizer", async () => {
    const { db } = await withFriends();

    const arrival = await startGroupSignedOut(db, "  Tailgate Crew ", COUSIN, THURSDAY);

    expect(arrival.group).toMatchObject({ name: "Tailgate Crew" });
    expect(arrival.group.joinToken.length).toBeGreaterThan(20);
    expect((await getSession(db, arrival.sessionId))?.id).toBe(arrival.member.id);
    expect(await memberGroups(db, arrival.member.id)).toEqual([
      expect.objectContaining({ group: expect.objectContaining({ id: arrival.group.id }), role: "organizer" }),
    ]);
    expect((await manageGroup(db, arrival.member, arrival.group.id)).commissioner).toBe(false);
  });

  test("signed out: a phone number already in the app is refused before anything is written", async () => {
    const { db, grandma } = await withFriends();
    const [people, groupsBefore] = await Promise.all([db.select().from(members), db.query.groups.findMany()]);

    await expect(startGroupSignedOut(db, "Tailgate Crew", { ...COUSIN, phone: grandma.phone! }, THURSDAY)).rejects.toThrow(
      "This number already plays in another group. Text yourself your link below, open it, then start your group from there.",
    );
    expect(await db.select().from(members)).toHaveLength(people.length);
    expect(await db.query.groups.findMany()).toHaveLength(groupsBefore.length);
  });

  test("a group needs a name", async () => {
    const { db, grandma } = await withFriends();

    await expect(startGroupSignedOut(db, " ", COUSIN, THURSDAY)).rejects.toThrow("A group name is 1 to 40 characters.");
    await expect(startGroupSignedIn(db, grandma, "", THURSDAY)).rejects.toThrow("A group name is 1 to 40 characters.");
  });

  test("signed in: the creator organizes the new group, joined now, and keeps their other groups", async () => {
    const { db, grandma, family } = await withFriends();

    const group = await startGroupSignedIn(db, grandma, "Grandma's Bridge Club", SUNDAY);

    expect((await manageGroup(db, grandma, group.id)).group.id).toBe(group.id);
    expect((await memberGroups(db, grandma.id)).map((g) => [g.group.id, g.role])).toEqual([
      [family.id, "member"],
      [group.id, "organizer"],
    ]);
  });
});

describe("leaving a group", () => {
  test("a member leaves: off the group's boards, their other groups untouched, and not on the Removed list", async () => {
    const { db, jonah, grandma, family, friends } = await withFriends();
    await joinGroup(db, friends, grandma, TUESDAY);

    await leaveGroup(db, grandma, family.id, THURSDAY);

    expect((await groupBoard(db, family.id)).map((m) => m.id)).not.toContain(grandma.id);
    expect((await memberGroups(db, grandma.id)).map((g) => g.group.id)).toEqual([friends.id]);
    const view = await manageView(db, await manageGroup(db, jonah, family.id), THURSDAY);
    expect(view.removed).toEqual([]);
  });

  test("the last organizer is refused, and may leave once another organizer remains", async () => {
    const { db, grandma, friends } = await withFriends();
    await joinGroup(db, friends, grandma, TUESDAY, "organizer");

    await expect(leaveGroup(db, grandma, friends.id, THURSDAY)).rejects.toThrow(
      "Make someone else an organizer before you leave.",
    );
    expect(await joinStanding(db, grandma.id, friends.id)).toBe("in");

    const cousin = (await joinSignedOut(db, friends.joinToken, COUSIN, TUESDAY)).member;
    await db.update(memberships).set({ role: "organizer" }).where(eq(memberships.memberId, cousin.id));
    await leaveGroup(db, grandma, friends.id, THURSDAY);
    expect(await joinStanding(db, grandma.id, friends.id)).toBe("left");
  });

  test("a commissioner may leave a group they organize alone: commissioners run every group anyway", async () => {
    const { db, jonah, family } = await withFriends();

    await leaveGroup(db, jonah, family.id, THURSDAY);

    expect(await joinStanding(db, jonah.id, family.id)).toBe("left");
  });

  test("leaving a group you are not in is refused", async () => {
    const { db, grandma, jonah, friends, family } = await withFriends();
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), grandma.id, TUESDAY);

    await expect(leaveGroup(db, grandma, friends.id, THURSDAY)).rejects.toThrow("You are not in Friends.");
    await expect(leaveGroup(db, grandma, family.id, THURSDAY)).rejects.toThrow("You are not in Mabry Family.");
  });

  test("a commissioner can add someone who left back, with their original joined-at", async () => {
    const { db, jonah, grandma, family } = await withFriends();
    const [original] = await db.select().from(memberships).where(eq(memberships.memberId, grandma.id));
    await leaveGroup(db, grandma, family.id, TUESDAY);
    const manager = await manageGroup(db, jonah, family.id);
    expect((await manageView(db, manager, THURSDAY)).addable.map((p) => p.id)).toContain(grandma.id);

    await addExistingToGroup(db, manager, grandma.id, THURSDAY);

    expect((await memberGroups(db, grandma.id)).map((g) => g.joinedAt)).toEqual([original.joinedAt]);
  });

  test("an organizer cannot restore someone who left: they rejoin through the link", async () => {
    const { db, jonah, grandma, family } = await withFriends();
    await leaveGroup(db, grandma, family.id, TUESDAY);

    await expect(restoreToGroup(db, await manageGroup(db, jonah, family.id), grandma.id, THURSDAY)).rejects.toThrow(
      "Grandma left on their own; they rejoin through the Join Link.",
    );
    const [row] = await db.select().from(membershipRemovals).where(eq(membershipRemovals.memberId, grandma.id));
    expect(row).toMatchObject({ kind: "left", restoredAt: null });
  });
});
