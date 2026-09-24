/**
 * Deleting and removing Chat messages (#250) through the server seam: who may
 * take down which message, what the row keeps, and the placeholder the thread
 * shows in its place.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { chatMessages, memberships, seasons } from "@/db/schema";
import { manageGroup, promoteInGroup, removeFromGroup } from "@/lib/groups/manage";
import { addGroup, familyGroup, joinAt, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { canRemoveIn, chatThread, InvalidChat, NotInGroup, postMessage, setReaction, takeDown, unreadCount } from "./chat";

const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(THURSDAY.getTime() + minutes * MINUTE);

const REFUSED = "Only the group's organizers can remove someone else's message.";

async function row(db: Awaited<ReturnType<typeof seedWeek2>>["db"], id: number) {
  const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
  return message;
}

describe("deleting your own", () => {
  test("any Member deletes their own message: the row stays with deletedAt set and no remover", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, grandma, family.id, "Oops", at(0));

    await takeDown(db, grandma, family.id, message.id, at(1));

    expect(await row(db, message.id)).toEqual(expect.objectContaining({ text: "Oops", deletedAt: at(1), removedBy: null }));
    const thread = await chatThread(db, grandma, family.id);
    expect(thread.messages).toEqual([expect.objectContaining({ id: message.id, text: "", gone: "deleted" })]);
  });

  test("an Organizer or Commissioner taking down their own message deletes it, not removes it", async () => {
    const { db, jonah } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Typo", at(0));

    await takeDown(db, jonah, family.id, message.id, at(1));

    expect((await row(db, message.id)).removedBy).toBeNull();
    expect((await chatThread(db, jonah, family.id)).messages[0].gone).toBe("deleted");
  });
});

describe("removing someone else's", () => {
  test("a Member is refused on someone else's message, and it stays", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));

    await expect(takeDown(db, grandma, family.id, message.id, at(1))).rejects.toThrow(new InvalidChat(REFUSED));
    expect((await row(db, message.id)).deletedAt).toBeNull();
    expect(await canRemoveIn(db, grandma, family.id)).toBe(false);
  });

  test("an Organizer removes anyone's in their own Group, and the thread says an Organizer did", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const priya = await joinAt(db, jonah, "Priya", TUESDAY);
    await promoteInGroup(db, await manageGroup(db, jonah, family.id), grandma.id);
    const message = await postMessage(db, priya, family.id, "Over the line", at(0));

    expect(await canRemoveIn(db, grandma, family.id)).toBe(true);
    await takeDown(db, grandma, family.id, message.id, at(1));

    expect(await row(db, message.id)).toEqual(expect.objectContaining({ deletedAt: at(1), removedBy: grandma.id }));
    const thread = await chatThread(db, priya, family.id);
    expect(thread.messages).toEqual([expect.objectContaining({ text: "", gone: "organizer", reactions: [], mine: null })]);
  });

  test("an Organizer only in their own Group: organizing one gives no power in another", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    const priya = await joinAt(db, jonah, "Priya", TUESDAY);
    await joinGroup(db, cousins, grandma, TUESDAY, "organizer");
    await joinGroup(db, cousins, priya, TUESDAY);
    const inFamily = await postMessage(db, priya, family.id, "Family only", at(0));
    const inCousins = await postMessage(db, priya, cousins.id, "Cousins only", at(0));

    expect(await canRemoveIn(db, grandma, family.id)).toBe(false);
    await expect(takeDown(db, grandma, family.id, inFamily.id, at(1))).rejects.toThrow(new InvalidChat(REFUSED));

    await takeDown(db, grandma, cousins.id, inCousins.id, at(1));
    expect((await row(db, inCousins.id)).removedBy).toBe(grandma.id);
  });

  test("a message is taken down only through its own Group's thread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, jonah, TUESDAY, "organizer");
    await joinGroup(db, cousins, grandma, TUESDAY);
    const message = await postMessage(db, grandma, family.id, "Family only", at(0));

    await expect(takeDown(db, jonah, cousins.id, message.id, at(1))).rejects.toThrow(new InvalidChat("That message is gone."));
    expect((await row(db, message.id)).deletedAt).toBeNull();
  });

  test("a removed Organizer removes nothing", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const cousins = await addGroup(db, "Cousins");
    const priya = await joinAt(db, jonah, "Priya", TUESDAY);
    await joinGroup(db, cousins, grandma, TUESDAY, "organizer");
    await joinGroup(db, cousins, priya, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY);
    const message = await postMessage(db, priya, cousins.id, "Hi", at(0));
    await removeFromGroup(db, await manageGroup(db, jonah, cousins.id), grandma.id, at(1));

    await expect(takeDown(db, grandma, cousins.id, message.id, at(2))).rejects.toThrow(NotInGroup);
    expect((await row(db, message.id)).deletedAt).toBeNull();
  });

  test("a Commissioner removes anyone's in a Group they are in, and the thread says a Commissioner did", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    // A commissioner removes as one whatever their role in the Group.
    await db.update(memberships).set({ role: "member" }).where(eq(memberships.memberId, jonah.id));
    const message = await postMessage(db, grandma, family.id, "Over the line", at(0));

    expect(await canRemoveIn(db, jonah, family.id)).toBe(true);
    await takeDown(db, jonah, family.id, message.id, at(1));

    expect((await row(db, message.id)).removedBy).toBe(jonah.id);
    expect((await chatThread(db, grandma, family.id)).messages[0].gone).toBe("commissioner");
  });
});

describe("a message already gone", () => {
  test("is refused, so the first of two takedowns stands", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, grandma, family.id, "Oops", at(0));
    await takeDown(db, grandma, family.id, message.id, at(1));

    await expect(takeDown(db, jonah, family.id, message.id, at(2))).rejects.toThrow(new InvalidChat("That message is gone."));
    expect(await row(db, message.id)).toEqual(expect.objectContaining({ deletedAt: at(1), removedBy: null }));
  });

  test("last season's, and one that never was, are refused", async () => {
    const { db, jonah } = await seedWeek2();
    const family = await familyGroup(db);
    const old = await postMessage(db, jonah, family.id, "Last year", at(0));
    const [lastYear] = await db
      .insert(seasons)
      .values({ year: 2025, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2, tiebreakOrder: "" } })
      .returning();
    await db.update(chatMessages).set({ seasonId: lastYear.id }).where(eq(chatMessages.id, old.id));

    await expect(takeDown(db, jonah, family.id, old.id, at(1))).rejects.toThrow(new InvalidChat("That message is gone."));
    await expect(takeDown(db, jonah, family.id, 9999, at(1))).rejects.toThrow(new InvalidChat("That message is gone."));
  });

  test("takes no reaction, serves none, and counts toward nobody's unread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));
    await setReaction(db, grandma, family.id, message.id, "hot", at(1));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(1);

    await takeDown(db, jonah, family.id, message.id, at(2));

    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
    expect((await chatThread(db, grandma, family.id)).messages[0]).toEqual(expect.objectContaining({ reactions: [], mine: null }));
    await expect(setReaction(db, grandma, family.id, message.id, "ha", at(3))).rejects.toThrow(InvalidChat);
  });
});
