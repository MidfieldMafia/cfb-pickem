/**
 * Chat reactions (#249) through the server seam: one per Member per message,
 * switching and taking one off, the counts the thread carries, and which
 * messages take one at all.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { chatMessages, chatReactions, seasons } from "@/db/schema";
import { deleteGroup } from "@/lib/groups/console";
import { manageGroup, removeFromGroup } from "@/lib/groups/manage";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { addGroup, familyGroup, joinAt, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { chatThread, InvalidChat, NotInGroup, postMessage, setReaction } from "./chat";
import { reactionSheet, tapReaction, withReaction } from "./reactions";

const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(THURSDAY.getTime() + minutes * MINUTE);

describe("a tap", () => {
  test("puts a reaction on, takes the same one off, and switches to another", () => {
    expect(tapReaction(null, "hot")).toBe("hot");
    expect(tapReaction("hot", "hot")).toBeNull();
    expect(tapReaction("hot", "ha")).toBe("ha");
  });
});

describe("the counts a tap shows before the server answers", () => {
  const VIEWER = 1;
  const message = {
    reactions: [{ kind: "hot" as const, count: 2 }, { kind: "ha" as const, count: 1 }],
    mine: "ha" as const,
    reactors: [
      { memberId: 2, kind: "hot" as const },
      { memberId: VIEWER, kind: "ha" as const },
      { memberId: 3, kind: "hot" as const },
    ],
  };

  test("switching moves one from the old kind to the new, dropping a kind that reaches zero, and puts the viewer first", () => {
    expect(withReaction(message, VIEWER, "flag")).toEqual({
      reactions: [
        { kind: "flag", count: 1 },
        { kind: "hot", count: 2 },
      ],
      mine: "flag",
      reactors: [
        { memberId: VIEWER, kind: "flag" },
        { memberId: 2, kind: "hot" },
        { memberId: 3, kind: "hot" },
      ],
    });
  });

  test("taking it off drops the viewer from who reacted", () => {
    expect(withReaction(message, VIEWER, null)).toEqual({
      reactions: [{ kind: "hot", count: 2 }],
      mine: null,
      reactors: [
        { memberId: 2, kind: "hot" },
        { memberId: 3, kind: "hot" },
      ],
    });
  });

  test("putting one on a kind others already have", () => {
    const without = { reactions: [{ kind: "hot" as const, count: 2 }], mine: null, reactors: message.reactors.filter((r) => r.memberId !== VIEWER) };
    expect(withReaction(without, VIEWER, "hot")).toEqual({
      reactions: [{ kind: "hot", count: 3 }],
      mine: "hot",
      reactors: [
        { memberId: VIEWER, kind: "hot" },
        { memberId: 2, kind: "hot" },
        { memberId: 3, kind: "hot" },
      ],
    });
  });
});

describe("the sheet of who reacted", () => {
  const message = {
    reactions: [{ kind: "hot" as const, count: 2 }, { kind: "ha" as const, count: 1 }],
    reactors: [
      { memberId: 2, kind: "hot" as const },
      { memberId: 1, kind: "ha" as const },
      { memberId: 3, kind: "hot" as const },
    ],
    gone: null,
  };

  test("has All, then a tab per reaction in the tray's order, and lists everyone on All", () => {
    expect(reactionSheet(message, null)).toEqual({
      tabs: [
        { kind: null, count: 3 },
        { kind: "hot", count: 2 },
        { kind: "ha", count: 1 },
      ],
      selected: null,
      reactors: message.reactors,
    });
  });

  test("on a reaction's tab, lists only the people who chose it, newest first as they came", () => {
    expect(reactionSheet(message, "hot")?.reactors).toEqual([
      { memberId: 2, kind: "hot" },
      { memberId: 3, kind: "hot" },
    ]);
  });

  test("falls back to All when the selected reaction has dropped to zero", () => {
    expect(reactionSheet(message, "flag")).toMatchObject({ selected: null, reactors: message.reactors });
  });

  test("has nothing to show once the message has no reactions, or is gone", () => {
    expect(reactionSheet({ reactions: [], reactors: [], gone: null }, null)).toBeNull();
    expect(reactionSheet({ ...message, gone: "deleted" as const }, null)).toBeNull();
  });
});

describe("reacting", () => {
  test("one reaction per member per message: switching replaces it, the same again takes it off", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));

    await setReaction(db, grandma, family.id, message.id, "hot", at(1));
    await setReaction(db, grandma, family.id, message.id, "respect", at(2));
    expect(await db.select().from(chatReactions)).toEqual([
      { messageId: message.id, memberId: grandma.id, kind: "respect", createdAt: at(2) },
    ]);

    await setReaction(db, grandma, family.id, message.id, null, at(3));
    expect(await db.select().from(chatReactions)).toEqual([]);
  });

  test("setting the reaction you already have leaves it, so a tap sent twice lands where one would", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));

    await setReaction(db, grandma, family.id, message.id, "ha", at(1));
    await setReaction(db, grandma, family.id, message.id, "ha", at(1));
    await setReaction(db, grandma, family.id, message.id, null, at(2));
    await setReaction(db, grandma, family.id, message.id, null, at(2));
    expect(await db.select().from(chatReactions)).toEqual([]);
  });

  test("the thread carries each kind's count in the tray's order, and the reader's own", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const priya = await joinAt(db, jonah, "Priya", TUESDAY);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));
    const quiet = await postMessage(db, jonah, family.id, "Anyone?", at(1));

    await setReaction(db, grandma, family.id, message.id, "ha", at(2));
    await setReaction(db, priya, family.id, message.id, "ha", at(2));
    await setReaction(db, jonah, family.id, message.id, "flag", at(2));

    const grandmas = await chatThread(db, grandma, family.id);
    expect(grandmas.messages.map((m) => [m.id, m.reactions, m.mine])).toEqual([
      [
        message.id,
        [
          { kind: "flag", count: 1 },
          { kind: "ha", count: 2 },
        ],
        "ha",
      ],
      [quiet.id, [], null],
    ]);
    const jonahs = await chatThread(db, jonah, family.id);
    expect(jonahs.messages[0].mine).toBe("flag");
  });

  test("refuses a Group the member is not in, and a message from another Group's thread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    const elsewhere = await postMessage(db, grandma, cousins.id, "Cousins only", at(0));

    await expect(setReaction(db, jonah, cousins.id, elsewhere.id, "ha", at(1))).rejects.toThrow(NotInGroup);
    await expect(setReaction(db, jonah, family.id, elsewhere.id, "ha", at(1))).rejects.toThrow(
      new InvalidChat("That message is gone."),
    );
    expect(await db.select().from(chatReactions)).toEqual([]);
  });

  test("refuses a removed member", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const message = await postMessage(db, jonah, family.id, "Bold Lock", at(0));
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), grandma.id, at(1));

    await expect(setReaction(db, grandma, family.id, message.id, "ha", at(2))).rejects.toThrow(NotInGroup);
  });

  test("refuses a deleted message, last season's, and one that never was", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const gone = await postMessage(db, jonah, family.id, "Oops", at(0));
    const old = await postMessage(db, jonah, family.id, "Last year", at(1));
    await db.update(chatMessages).set({ deletedAt: at(2) }).where(eq(chatMessages.id, gone.id));
    const [lastYear] = await db
      .insert(seasons)
      .values({ year: 2025, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2, tiebreakOrder: "" } })
      .returning();
    await db.update(chatMessages).set({ seasonId: lastYear.id }).where(eq(chatMessages.id, old.id));

    for (const id of [gone.id, old.id, 9999]) {
      await expect(setReaction(db, grandma, family.id, id, "ha", at(3))).rejects.toThrow(new InvalidChat("That message is gone."));
    }
  });
});

describe("deleting the people and groups reactions name", () => {
  test("deleting a member takes their reactions and everyone's reactions to their messages", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const priya = await joinAt(db, jonah, "Priya", TUESDAY);
    const hers = await postMessage(db, grandma, family.id, "Roll Tide", at(0));
    const his = await postMessage(db, jonah, family.id, "Bold Lock", at(1));
    await setReaction(db, jonah, family.id, hers.id, "respect", at(2));
    await setReaction(db, grandma, family.id, his.id, "hot", at(2));
    await setReaction(db, priya, family.id, his.id, "ha", at(2));

    await setMemberActive(db, jonah, grandma.id, false);
    await removeMember(db, jonah, grandma.id);

    expect(await db.select().from(chatReactions)).toEqual([expect.objectContaining({ memberId: priya.id, messageId: his.id })]);
  });

  test("deleting a Group takes the reactions in its thread", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY);
    const message = await postMessage(db, grandma, cousins.id, "Hi", at(0));
    await setReaction(db, jonah, cousins.id, message.id, "ha", at(1));

    await deleteGroup(db, jonah, cousins.id, "Cousins");
    expect(await db.select().from(chatReactions)).toEqual([]);
  });
});
