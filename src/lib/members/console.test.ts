import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { members, picks } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { pickAs, publishWeek2, THURSDAY } from "@/test/week-2";
import { applyEdit } from "@/lib/picks/edits";
import { asCommissioner } from "./authority";
import {
  addMember,
  bootstrapCommissioner,
  listMembers,
  magicLinkFor,
  NotCommissioner,
  pickCountByMember,
  regenerateMagicLink,
  removeMember,
  setMemberActive,
} from "./members";
import { exchangeToken, getSession } from "./auth";

async function setup() {
  const db = await createTestDb();
  const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });
  const grandma = await addMember(db, jonah, { displayName: "Grandma", phone: "+12565550140" });
  return { db, jonah, grandma };
}

describe("commissioner console", () => {
  test("a commissioner adds a member and hands them a working magic link", async () => {
    const { db, jonah, grandma } = await setup();

    const link = magicLinkFor(grandma, "https://slate.midfield-mafia.com");
    expect(link).toBe(`https://slate.midfield-mafia.com/m/${grandma.token}`);

    const signIn = await exchangeToken(db, grandma.token);
    expect(signIn?.member.displayName).toBe("Grandma");
    expect(signIn?.member.isCommissioner).toBe(false);

    const roster = await listMembers(db, jonah);
    expect(roster.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
  });

  test("regenerating a magic link stops the old link and signs out its sessions", async () => {
    const { db, jonah, grandma } = await setup();
    const oldToken = grandma.token;
    const oldSession = await exchangeToken(db, oldToken);

    const refreshed = await regenerateMagicLink(db, jonah, grandma.id);

    expect(refreshed.token).not.toBe(oldToken);
    expect(await exchangeToken(db, oldToken)).toBeNull();
    expect(await getSession(db, oldSession!.sessionId)).toBeNull();
    expect((await exchangeToken(db, refreshed.token))?.member.id).toBe(grandma.id);
  });

  test("regenerating your own link keeps the device that did it signed in", async () => {
    const { db, jonah } = await setup();
    const thisPhone = await exchangeToken(db, jonah.token);
    const oldLaptop = await exchangeToken(db, jonah.token);

    const refreshed = await regenerateMagicLink(db, jonah, jonah.id, { keepSessionId: thisPhone!.sessionId });

    expect((await getSession(db, thisPhone!.sessionId))?.id).toBe(jonah.id);
    expect(await getSession(db, oldLaptop!.sessionId)).toBeNull();
    expect(await exchangeToken(db, jonah.token)).toBeNull();
    expect((await exchangeToken(db, refreshed.token))?.member.id).toBe(jonah.id);
  });

  test("a deactivated member cannot sign in and their sessions stop working", async () => {
    const { db, jonah, grandma } = await setup();
    const session = await exchangeToken(db, grandma.token);

    await setMemberActive(db, jonah, grandma.id, false);

    expect(await exchangeToken(db, grandma.token)).toBeNull();
    expect(await getSession(db, session!.sessionId)).toBeNull();

    await setMemberActive(db, jonah, grandma.id, true);
    expect((await exchangeToken(db, grandma.token))?.member.id).toBe(grandma.id);
  });

  test("a member who is not a commissioner cannot use the console", async () => {
    const { db, jonah, grandma } = await setup();

    await expect(addMember(db, grandma, { displayName: "Uncle Rick" })).rejects.toBeInstanceOf(NotCommissioner);
    await expect(listMembers(db, grandma)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(regenerateMagicLink(db, grandma, jonah.id)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(setMemberActive(db, grandma, jonah.id, false)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(removeMember(db, grandma, jonah.id)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(pickCountByMember(db, grandma)).rejects.toBeInstanceOf(NotCommissioner);
  });

  test("a commissioner cannot deactivate themselves", async () => {
    const { db, jonah } = await setup();

    await expect(setMemberActive(db, jonah, jonah.id, false)).rejects.toThrow(/yourself/);
  });

  test("deleting a deactivated member takes their picks, their sessions and their link with them", async () => {
    const { db, jonah, grandma, slate, michigan, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
    const session = await exchangeToken(db, grandma.token);
    await setMemberActive(db, jonah, grandma.id, false);
    expect(await pickCountByMember(db, jonah)).toEqual(new Map([[grandma.id, 2]]));

    const gone = await removeMember(db, jonah, grandma.id);

    expect(gone.id).toBe(grandma.id);
    expect((await listMembers(db, jonah)).map((m) => m.displayName)).toEqual(["Jonah"]);
    expect(await db.query.picks.findMany({ where: eq(picks.memberId, grandma.id) })).toEqual([]);
    expect(await pickCountByMember(db, jonah)).toEqual(new Map());
    expect(await getSession(db, session!.sessionId)).toBeNull();
    expect(await exchangeToken(db, grandma.token)).toBeNull();
    await expect(removeMember(db, jonah, grandma.id)).rejects.toThrow(/no such member/i);
  });

  test("an active member is deactivated first, and a commissioner is never deleted by themselves", async () => {
    const { db, jonah, grandma } = await setup();

    await expect(removeMember(db, jonah, grandma.id)).rejects.toThrow(/deactivate grandma first/i);
    await expect(removeMember(db, jonah, jonah.id)).rejects.toThrow(/yourself/);
    expect((await listMembers(db, jonah)).map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
  });

  test("a former commissioner whose edits are on the record stays", async () => {
    const { db, jonah, grandma, slate, michigan } = await publishWeek2();
    const [alex] = await db.update(members).set({ isCommissioner: true }).where(eq(members.id, grandma.id)).returning();
    await applyEdit(
      db,
      asCommissioner(alex, jonah.id),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.awayTeamId },
      THURSDAY,
    );
    await setMemberActive(db, jonah, alex.id, false);

    await expect(removeMember(db, jonah, alex.id)).rejects.toThrow(/on the record/);
    expect((await listMembers(db, jonah)).map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
  });
});
