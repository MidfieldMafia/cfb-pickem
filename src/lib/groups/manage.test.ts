/**
 * An organizer runs their own group from the Manage screen, and a commissioner
 * runs any. Every row of the spec's permission matrix that an organizer holds
 * is enforced here, in the library, against the acting member — the screen
 * hiding a button is never the check.
 *
 * Built on the published Week 2 fixture, with Aunt Jo as Mabry Family's one
 * organizer who is not a commissioner, so every test can tell "an organizer may"
 * apart from "a commissioner may".
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, memberships, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { exchangeToken, getSession } from "@/lib/members/auth";
import { Refusal } from "@/lib/refusal";
import {
  addGroup,
  familyGroup,
  guessAs,
  joinAt,
  joinGroup,
  lockAs,
  pickAs,
  publishWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import {
  addToGroup,
  demoteInGroup,
  manageGroup,
  manageView,
  NotOrganizer,
  promoteInGroup,
  regenerateInGroup,
  removeFromGroup,
  renameGroup,
  restoreToGroup,
} from "./manage";
import { memberGroups } from "./memberships";

/** Week 2 open, with Aunt Jo organizing Mabry Family beside Jonah. */
async function organized() {
  const fixture = await publishWeek2();
  const { db, jonah } = fixture;
  const family = await familyGroup(db);
  const jo = await joinAt(db, jonah, "Aunt Jo", TUESDAY);
  await db
    .update(memberships)
    .set({ role: "organizer" })
    .where(eq(memberships.memberId, jo.id));
  return { ...fixture, family, jo };
}

describe("who manages a group", () => {
  test("a plain member of the group is not its manager", async () => {
    const { db, grandma, family } = await organized();

    await expect(manageGroup(db, grandma, family.id)).rejects.toBeInstanceOf(NotOrganizer);
  });

  test("an organizer manages their group, and a commissioner manages it without organizing it", async () => {
    const { db, jonah, jo, family } = await organized();
    await db.update(memberships).set({ role: "member" }).where(eq(memberships.memberId, jonah.id));

    expect((await manageGroup(db, jo, family.id)).group.id).toBe(family.id);
    expect((await manageGroup(db, jonah, family.id)).commissioner).toBe(true);
  });
});

describe("the reminder view", () => {
  /** Grandma has picked two of three with Michigan Locked and a guess of 61; Aunt Jo nothing. */
  async function partway() {
    const fixture = await organized();
    const { db, grandma, slate, michigan, texas } = fixture;
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await guessAs(db, grandma, slate, 61, THURSDAY);
    return fixture;
  }

  const row = (view: Awaited<ReturnType<typeof manageView>>, member: Member) =>
    view.members.find((m) => m.id === member.id)!;

  test("an organizer sees progress, what is set, and what is missing", async () => {
    const { db, grandma, jo, family } = await partway();

    const view = await manageView(db, await manageGroup(db, jo, family.id), THURSDAY);

    expect(row(view, grandma).reminder).toEqual({
      picksMade: 2,
      liveGames: 3,
      lockSet: true,
      guessSet: true,
      status: "Missing 1 pick",
    });
    expect(row(view, jo).reminder!.status).toBe("Missing 3 picks, Lock of the Week, Tiebreaker Guess");
  });

  test("what an organizer receives never holds a team or a guess", async () => {
    const { db, jo, family, michigan } = await partway();

    const view = await manageView(db, await manageGroup(db, jo, family.id), THURSDAY);
    const sent = JSON.stringify(view);

    expect(sent).not.toContain(michigan.homeTeam);
    expect(sent).not.toContain(michigan.awayTeam);
    expect(sent).not.toContain("61");
    expect(sent).not.toContain("teamId");
    // Nor a Magic Link: an organizer copies one only right after making it.
    expect(sent).not.toContain("token");
  });

  test("a commissioner sees the Lock's team and the guess in the same view", async () => {
    const { db, jonah, grandma, family, michigan } = await partway();

    const view = await manageView(db, await manageGroup(db, jonah, family.id), THURSDAY);

    expect(row(view, grandma).revealed).toEqual({ lockTeam: michigan.homeTeam, guess: 61 });
  });

  test("the group's phone numbers are in the view", async () => {
    const { db, grandma, jo, family } = await partway();
    await db.update(members).set({ phone: "+12565550140" }).where(eq(members.id, grandma.id));

    const view = await manageView(db, await manageGroup(db, jo, family.id), THURSDAY);

    expect(row(view, grandma).phone).toBe("+12565550140");
  });
});

describe("adding a person", () => {
  test("an organizer adds someone new by name and phone, and gets their Magic Link once", async () => {
    const { db, jo } = await organized();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jo, TUESDAY, "organizer");

    const added = await addToGroup(db, await manageGroup(db, jo, friends.id), { displayName: "Cousin Al", phone: "+12565550199" }, THURSDAY);

    expect((await exchangeToken(db, added.token))?.member.displayName).toBe("Cousin Al");
    // Only the group they were added to, joined now: Mabry Family is not theirs.
    expect((await memberGroups(db, added.id)).map((g) => [g.group.id, g.role, g.joinedAt])).toEqual([
      [friends.id, "member", THURSDAY],
    ]);
    // And the view that follows does not carry the link again.
    const view = await manageView(db, await manageGroup(db, jo, friends.id), THURSDAY);
    expect(JSON.stringify(view)).not.toContain(added.token);
  });

  test("the name and the phone number are both required", async () => {
    const { db, jo, family } = await organized();
    const manager = await manageGroup(db, jo, family.id);

    await expect(addToGroup(db, manager, { displayName: "Cousin Al", phone: " " }, THURSDAY)).rejects.toThrow(
      "Enter their phone number.",
    );
    await expect(addToGroup(db, manager, { displayName: " ", phone: "+12565550199" }, THURSDAY)).rejects.toBeInstanceOf(
      Refusal,
    );
  });

  test("a phone already in the app is refused without saying whose it is", async () => {
    const { db, grandma, jo } = await organized();
    await db.update(members).set({ phone: "+12565550140" }).where(eq(members.id, grandma.id));
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jo, TUESDAY, "organizer");

    await expect(
      addToGroup(db, await manageGroup(db, jo, friends.id), { displayName: "Nana", phone: "+12565550140" }, THURSDAY),
    ).rejects.toThrow("They already play in another group; send them your Join Link.");
  });
});

describe("removing and restoring", () => {
  test("an organizer removes a member, who leaves the group's list for its Removed list", async () => {
    const { db, grandma, jo, family } = await organized();
    const manager = await manageGroup(db, jo, family.id);

    await removeFromGroup(db, manager, grandma.id, THURSDAY);

    const view = await manageView(db, manager, THURSDAY);
    expect(view.members.map((m) => m.displayName)).toEqual(["Jonah", "Aunt Jo"]);
    expect(view.removed.map((m) => [m.displayName, m.removedAt])).toEqual([["Grandma", THURSDAY]]);
    expect(await memberGroups(db, grandma.id)).toEqual([]);
  });

  test("an organizer cannot remove an organizer, themselves included; a commissioner can", async () => {
    const { db, jonah, jo, family } = await organized();
    const byJo = await manageGroup(db, jo, family.id);

    await expect(removeFromGroup(db, byJo, jonah.id, THURSDAY)).rejects.toThrow("Jonah is an organizer, so they stay.");
    await expect(removeFromGroup(db, byJo, jo.id, THURSDAY)).rejects.toBeInstanceOf(Refusal);

    await removeFromGroup(db, await manageGroup(db, jonah, family.id), jo.id, THURSDAY);
    expect(await memberGroups(db, jo.id)).toEqual([]);
  });

  test("someone outside the group cannot be removed from it, nor removed twice", async () => {
    const { db, grandma, jo, family } = await organized();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jo, TUESDAY, "organizer");
    const manager = await manageGroup(db, jo, friends.id);

    await expect(removeFromGroup(db, manager, grandma.id, THURSDAY)).rejects.toThrow("They are not in Friends.");

    const inFamily = await manageGroup(db, jo, family.id);
    await removeFromGroup(db, inFamily, grandma.id, THURSDAY);
    await expect(removeFromGroup(db, inFamily, grandma.id, THURSDAY)).rejects.toBeInstanceOf(Refusal);
  });

  test("restoring puts a removed member back with their original join date", async () => {
    const { db, grandma, jo, family } = await organized();
    const manager = await manageGroup(db, jo, family.id);
    await removeFromGroup(db, manager, grandma.id, THURSDAY);

    await restoreToGroup(db, manager, grandma.id, SUNDAY);

    const view = await manageView(db, manager, SUNDAY);
    expect(view.members.map((m) => m.displayName)).toContain("Grandma");
    expect(view.removed).toEqual([]);
    expect((await memberGroups(db, grandma.id)).map((g) => g.joinedAt)).toEqual([TUESDAY]);
    await expect(restoreToGroup(db, manager, grandma.id, SUNDAY)).rejects.toThrow("Grandma is not removed.");
  });
});

describe("organizers", () => {
  const roleOf = async (db: Db, groupId: number, memberId: number) =>
    (await memberGroups(db, memberId)).find((g) => g.group.id === groupId)?.role;

  test("an organizer promotes a member to organizer", async () => {
    const { db, grandma, jo, family } = await organized();

    await promoteInGroup(db, await manageGroup(db, jo, family.id), grandma.id);

    expect(await roleOf(db, family.id, grandma.id)).toBe("organizer");
  });

  test("an organizer steps down only while another organizer remains", async () => {
    const { db, jonah, jo, family } = await organized();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jo, TUESDAY, "organizer");

    await expect(demoteInGroup(db, await manageGroup(db, jo, friends.id), jo.id)).rejects.toThrow(
      "Make someone else an organizer before you step down.",
    );

    // Mabry Family has Jonah too, so Aunt Jo may go.
    await demoteInGroup(db, await manageGroup(db, jo, family.id), jo.id);
    expect(await roleOf(db, family.id, jo.id)).toBe("member");
    expect(await roleOf(db, family.id, jonah.id)).toBe("organizer");
  });

  test("an organizer cannot demote another organizer; a commissioner can demote the last one", async () => {
    const { db, jonah, jo, family } = await organized();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jo, TUESDAY, "organizer");

    await expect(demoteInGroup(db, await manageGroup(db, jo, family.id), jonah.id)).rejects.toThrow(
      "Only Jonah can step down as an organizer.",
    );

    await demoteInGroup(db, await manageGroup(db, jonah, friends.id), jo.id);
    expect(await roleOf(db, friends.id, jo.id)).toBe("member");
  });
});

describe("regenerating a Magic Link", () => {
  test("an organizer regenerates the link of a member whose only group is theirs, signing them out", async () => {
    const { db, grandma, jo, family } = await organized();
    const session = await exchangeToken(db, grandma.token);

    const renewed = await regenerateInGroup(db, await manageGroup(db, jo, family.id), grandma.id);

    expect(renewed.token).not.toBe(grandma.token);
    expect(await exchangeToken(db, grandma.token)).toBeNull();
    expect(await getSession(db, session!.sessionId)).toBeNull();
    expect((await exchangeToken(db, renewed.token))?.member.id).toBe(grandma.id);
  });

  test("an organizer is refused for an organizer, or for a member who also plays elsewhere", async () => {
    const { db, jonah, grandma, jo, family } = await organized();
    const manager = await manageGroup(db, jo, family.id);
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, TUESDAY);

    await expect(regenerateInGroup(db, manager, jonah.id)).rejects.toThrow(
      "Jonah is an organizer; a commissioner can make them a new link.",
    );
    await expect(regenerateInGroup(db, manager, grandma.id)).rejects.toThrow(
      "Grandma plays in another group too; a commissioner can make them a new link.",
    );

    // A commissioner is bound by neither.
    const renewed = await regenerateInGroup(db, await manageGroup(db, jonah, family.id), grandma.id);
    expect(renewed.token).not.toBe(grandma.token);
  });
});

describe("renaming", () => {
  test("an organizer renames the group, and a blank name is refused", async () => {
    const { db, jo, family } = await organized();
    const manager = await manageGroup(db, jo, family.id);

    await expect(renameGroup(db, manager, "   ")).rejects.toBeInstanceOf(Refusal);
    await renameGroup(db, manager, "  The Mabrys ");

    expect((await manageView(db, await manageGroup(db, jo, family.id), THURSDAY)).group.name).toBe("The Mabrys");
  });
});
