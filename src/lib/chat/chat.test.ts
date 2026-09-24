/**
 * Chat (#248) through its server seam: posting, the length rule, who may read
 * and write a Group's thread, and the unread count behind the tab's badge.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { chatMessages, seasons } from "@/db/schema";
import { leaveGroup } from "@/lib/groups/join";
import { manageGroup, removeFromGroup, restoreToGroup } from "@/lib/groups/manage";
import { deleteGroup } from "@/lib/groups/console";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { addGroup, familyGroup, joinAt, joinGroup, seedWeek2, SUNDAY, THURSDAY, TUESDAY } from "@/test/week-2";
import { chatThread, InvalidChat, markRead, NotInGroup, postMessage, unreadCount } from "./chat";
import { MAX_CHAT_TEXT } from "./limits";

const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(THURSDAY.getTime() + minutes * MINUTE);

describe("posting", () => {
  test("keeps the trimmed text under the Group and the active Season", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    const message = await postMessage(db, grandma, family.id, "  Roll Tide.\n", THURSDAY);

    const [row] = await db.select().from(chatMessages);
    const [season] = await db.select().from(seasons);
    expect(row).toMatchObject({
      id: message.id,
      groupId: family.id,
      memberId: grandma.id,
      seasonId: season.id,
      text: "Roll Tide.",
      createdAt: THURSDAY,
      deletedAt: null,
      removedBy: null,
    });
  });

  test(`takes exactly ${MAX_CHAT_TEXT} characters and refuses one more`, async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    await postMessage(db, grandma, family.id, "a".repeat(MAX_CHAT_TEXT), THURSDAY);
    await expect(postMessage(db, grandma, family.id, "a".repeat(MAX_CHAT_TEXT + 1), THURSDAY)).rejects.toThrow(
      new InvalidChat(`A message is at most ${MAX_CHAT_TEXT} characters.`),
    );
    expect(await db.select().from(chatMessages)).toHaveLength(1);
  });

  test("counts characters, not UTF-16 units, so an emoji is one", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    await postMessage(db, grandma, family.id, "🏈".repeat(MAX_CHAT_TEXT), THURSDAY);
    expect(await db.select().from(chatMessages)).toHaveLength(1);
  });

  test.each([
    ["nothing", ""],
    ["only spaces", "  \n\t "],
  ])("refuses %s", async (_, text) => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    await expect(postMessage(db, grandma, family.id, text, THURSDAY)).rejects.toThrow(new InvalidChat("Say something first."));
  });

  test("refuses a Group the member is not in, a Commissioner included", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);

    await expect(postMessage(db, jonah, cousins.id, "Hello", THURSDAY)).rejects.toThrow(NotInGroup);
  });

  test("refuses a member removed from the Group, and takes them back once restored", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const manager = await manageGroup(db, jonah, family.id);

    await removeFromGroup(db, manager, grandma.id, THURSDAY);
    await expect(postMessage(db, grandma, family.id, "Hello", at(1))).rejects.toThrow(NotInGroup);
    await expect(chatThread(db, grandma, family.id)).rejects.toThrow(NotInGroup);

    await restoreToGroup(db, manager, grandma.id, at(2));
    await postMessage(db, grandma, family.id, "I'm back", at(3));
  });

  test("refuses a member who left the Group", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY, "organizer");

    await leaveGroup(db, grandma, cousins.id, THURSDAY);
    await expect(postMessage(db, grandma, cousins.id, "Bye", at(1))).rejects.toThrow(NotInGroup);
  });

  test("refuses when there is no active Season", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await db.update(seasons).set({ active: false });

    await expect(postMessage(db, grandma, family.id, "Hello", THURSDAY)).rejects.toThrow(
      new InvalidChat("Chat opens when the season does."),
    );
  });
});

describe("the thread", () => {
  test("is the Group's messages for the active Season, oldest first, with their senders", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);

    await postMessage(db, grandma, family.id, "First", at(0));
    await postMessage(db, jonah, family.id, "Second", at(1));
    await postMessage(db, grandma, cousins.id, "Elsewhere", at(2));

    const thread = await chatThread(db, grandma, family.id);
    expect(thread.messages.map((m) => [m.memberId, m.text])).toEqual([
      [grandma.id, "First"],
      [jonah.id, "Second"],
    ]);
    expect(thread.senders.map((s) => s.displayName).sort()).toEqual(["Grandma", "Jonah"]);
  });

  test("leaves out deleted messages and last season's", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const old = await postMessage(db, grandma, family.id, "Last year", at(0));
    const gone = await postMessage(db, grandma, family.id, "Oops", at(1));
    await postMessage(db, grandma, family.id, "Kept", at(2));
    await db.update(chatMessages).set({ deletedAt: at(3) }).where(eq(chatMessages.id, gone.id));
    const [lastYear] = await db
      .insert(seasons)
      .values({ year: 2025, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2, tiebreakOrder: "" } })
      .returning();
    await db.update(chatMessages).set({ seasonId: lastYear.id }).where(eq(chatMessages.id, old.id));

    const thread = await chatThread(db, grandma, family.id);
    expect(thread.messages.map((m) => m.text)).toEqual(["Kept"]);
  });

  test("still names a sender who has since been removed from the Group", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, grandma, family.id, "Hi all", at(0));
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), grandma.id, at(1));

    const thread = await chatThread(db, jonah, family.id);
    expect(thread.messages).toHaveLength(1);
    expect(thread.senders).toEqual([{ id: grandma.id, displayName: "Grandma", avatarId: grandma.avatarId }]);
  });

  test("is empty, not refused, when there is no active Season", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await db.update(seasons).set({ active: false });

    expect(await chatThread(db, grandma, family.id)).toEqual({ messages: [], senders: [] });
  });
});

describe("unread", () => {
  test("counts the others' messages since the member last opened the thread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    await postMessage(db, jonah, family.id, "One", at(0));
    await postMessage(db, jonah, family.id, "Two", at(1));
    await postMessage(db, grandma, family.id, "Mine", at(2));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(2);

    const thread = await chatThread(db, grandma, family.id);
    await markRead(db, grandma.id, family.id, thread);
    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);

    await postMessage(db, jonah, family.id, "Three", at(3));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(1);
  });

  test("never moves the marker backwards", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "One", at(0));
    const stale = await chatThread(db, grandma, family.id);
    await postMessage(db, jonah, family.id, "Two", at(1));
    await markRead(db, grandma.id, family.id, await chatThread(db, grandma, family.id));

    // A slower request from an older screen lands after the newer one.
    await markRead(db, grandma.id, family.id, stale);
    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
  });

  test("leaves out deleted messages", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const gone = await postMessage(db, jonah, family.id, "Oops", at(0));
    await db.update(chatMessages).set({ deletedAt: at(1) }).where(eq(chatMessages.id, gone.id));

    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
  });

  test("starts a newcomer at the moment they joined, not the start of the season", async () => {
    const { db, jonah } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "Before", at(0));
    const aunt = await joinAt(db, jonah, "Aunt Sue", at(1));
    await postMessage(db, jonah, family.id, "Welcome Sue", at(2));

    expect(await unreadCount(db, aunt.id, family.id)).toBe(1);
  });

  test("is per Group", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY);
    await postMessage(db, jonah, family.id, "Family", at(0));
    await postMessage(db, jonah, cousins.id, "Cousins 1", at(1));
    await postMessage(db, jonah, cousins.id, "Cousins 2", at(2));

    await markRead(db, grandma.id, family.id, await chatThread(db, grandma, family.id));
    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
    expect(await unreadCount(db, grandma.id, cousins.id)).toBe(2);
  });

  test("is zero outside the Group and without an active Season", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, jonah, TUESDAY);
    await postMessage(db, jonah, cousins.id, "Private", at(0));
    await postMessage(db, jonah, family.id, "Hello", at(1));

    expect(await unreadCount(db, grandma.id, cousins.id)).toBe(0);
    await db.update(seasons).set({ active: false });
    expect(await unreadCount(db, grandma.id, family.id)).toBe(0);
  });
});

describe("deleting the people and groups a thread names", () => {
  test("deleting a member takes their messages and clears their name from any they removed", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, grandma, family.id, "Mine", at(0));
    const theirs = await postMessage(db, jonah, family.id, "Jonah's", at(1));
    await db.update(chatMessages).set({ deletedAt: at(2), removedBy: grandma.id }).where(eq(chatMessages.id, theirs.id));
    // Grandma is not a commissioner, so this stands in for #250's removal by an Organizer.

    await setMemberActive(db, jonah, grandma.id, false);
    await removeMember(db, jonah, grandma.id);

    const rows = await db.select().from(chatMessages);
    expect(rows).toEqual([expect.objectContaining({ id: theirs.id, removedBy: null, deletedAt: at(2) })]);
  });

  test("deleting a Group takes its thread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await postMessage(db, grandma, cousins.id, "Hi", SUNDAY);

    await deleteGroup(db, jonah, cousins.id, "Cousins");
    expect(await db.select().from(chatMessages)).toEqual([]);
  });
});
