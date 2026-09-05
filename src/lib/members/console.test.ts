import { describe, expect, test } from "vitest";
import { createTestDb } from "@/test/db";
import {
  addMember,
  bootstrapCommissioner,
  listMembers,
  magicLinkFor,
  NotCommissioner,
  regenerateMagicLink,
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
  });

  test("a commissioner cannot deactivate themselves", async () => {
    const { db, jonah } = await setup();

    await expect(setMemberActive(db, jonah, jonah.id, false)).rejects.toThrow(/yourself/);
  });
});
