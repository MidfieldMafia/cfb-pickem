/**
 * Chat keeps one Season (#177, #251): starting the next deletes every Group's
 * messages and reactions from the last, gone ones included, and a second run
 * changes nothing.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { chatMessages, chatReactions, memberships } from "@/db/schema";
import { startSeason } from "@/lib/slate/season";
import { addGroup, familyGroup, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { chatThread, markRead, postMessage, setReaction, takeDown, unreadCount } from "./chat";

const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(THURSDAY.getTime() + minutes * MINUTE);

describe("a new Season", () => {
  test("deletes every Group's 2026 messages and reactions, gone ones included", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    const hello = await postMessage(db, jonah, family.id, "Roll Tide", at(0));
    await setReaction(db, grandma, family.id, hello.id, "ha", at(1));
    const oops = await postMessage(db, grandma, family.id, "Oops", at(2));
    await takeDown(db, grandma, family.id, oops.id, at(3));
    await postMessage(db, grandma, cousins.id, "Hi cousins", at(4));

    await startSeason(db, 2027);

    expect(await db.select().from(chatMessages)).toEqual([]);
    expect(await db.select().from(chatReactions)).toEqual([]);
    expect((await chatThread(db, grandma, family.id)).messages).toEqual([]);
    expect((await chatThread(db, grandma, cousins.id)).messages).toEqual([]);
  });

  test("2027 messages survive a second run, and it changes nothing", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "Last one of 2026", at(0));
    await startSeason(db, 2027);
    const kickoff = await postMessage(db, jonah, family.id, "Here we go again", at(10));
    await setReaction(db, grandma, family.id, kickoff.id, "respect", at(11));
    await markRead(db, grandma.id, family.id, await chatThread(db, grandma, family.id));
    const snapshot = async () => ({
      messages: await db.select().from(chatMessages),
      reactions: await db.select().from(chatReactions),
      memberships: await db.select().from(memberships),
    });
    const before = await snapshot();

    await startSeason(db, 2027);

    expect(await snapshot()).toEqual(before);
    expect(before.messages).toEqual([expect.objectContaining({ id: kickoff.id, text: "Here we go again" })]);
    expect((await chatThread(db, grandma, family.id)).messages).toEqual([
      expect.objectContaining({ id: kickoff.id, reactions: [{ kind: "respect", count: 1 }], mine: "respect" }),
    ]);
  });

  test("resets the unread markers, so the new thread starts at zero and counts from there", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "Read this", at(0));
    await markRead(db, grandma.id, family.id, await chatThread(db, grandma, family.id));
    await postMessage(db, jonah, family.id, "Never read", at(1));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(1);

    await startSeason(db, 2027);

    const [marker] = await db.select({ chatReadId: memberships.chatReadId }).from(memberships).where(eq(memberships.memberId, grandma.id));
    expect(marker.chatReadId).toBeNull();
    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
    await postMessage(db, jonah, family.id, "Welcome to 2027", at(10));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(1);
  });
});
