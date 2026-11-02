/**
 * Chat @mentions (#525) through the server seam: what a post stores, who it
 * mentions, the limit on what it reads as, what the thread hands the phone,
 * and every delete that has to clear the mentions first.
 */
import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { chatMentions, chatMessages, memberships } from "@/db/schema";
import { deleteGroup } from "@/lib/groups/console";
import { manageGroup, removeFromGroup } from "@/lib/groups/manage";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { startSeason } from "@/lib/slate/season";
import { addGroup, familyGroup, joinAt, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { chatThread, InvalidChat, markRead, mentionPeople, postMessage, takeDown } from "./chat";
import { MAX_CHAT_TEXT } from "./limits";

const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(THURSDAY.getTime() + minutes * MINUTE);

async function seed() {
  const fixture = await seedWeek2();
  const family = await familyGroup(fixture.db);
  const tom = await joinAt(fixture.db, fixture.jonah, "Tom Bradley", TUESDAY);
  return { ...fixture, family, tom };
}

const mentionRows = async (db: Awaited<ReturnType<typeof seed>>["db"]) =>
  db.select().from(chatMentions).orderBy(asc(chatMentions.messageId), asc(chatMentions.memberId));

describe("posting a mention", () => {
  test("keeps the token in the text and writes a row for the Member it names", async () => {
    const { db, grandma, family, tom } = await seed();

    const message = await postMessage(db, grandma, family.id, `<@${tom.id}> you are on the hook`, THURSDAY);

    expect(message.text).toBe(`<@${tom.id}> you are on the hook`);
    expect(await mentionRows(db)).toEqual([{ messageId: message.id, memberId: tom.id }]);
  });

  test("@everyone writes a row for each Member of the Group but the sender", async () => {
    const { db, jonah, grandma, family, tom } = await seed();
    const cousins = await addGroup(db, "Cousins");
    const cousinOnly = await joinAt(db, jonah, "Cousin Lou", TUESDAY);
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), cousinOnly.id, TUESDAY);
    await joinGroup(db, cousins, cousinOnly, TUESDAY);

    const message = await postMessage(db, grandma, family.id, "<@everyone> picks lock at 11", THURSDAY);

    expect(message.text).toBe("<@everyone> picks lock at 11");
    expect(await mentionRows(db)).toEqual(
      [jonah.id, tom.id].sort((a, b) => a - b).map((memberId) => ({ messageId: message.id, memberId })),
    );
  });

  test("names someone once however often they are mentioned, and never the sender", async () => {
    const { db, grandma, family, tom } = await seed();

    const message = await postMessage(db, grandma, family.id, `<@${tom.id}> <@${tom.id}> <@${grandma.id}> <@everyone>`, THURSDAY);

    expect((await mentionRows(db)).filter((row) => row.memberId === tom.id)).toEqual([{ messageId: message.id, memberId: tom.id }]);
    expect((await mentionRows(db)).some((row) => row.memberId === grandma.id)).toBe(false);
  });

  test("turns a Member outside the Group back into their name as text, and drops an id nobody has", async () => {
    const { db, jonah, grandma, family } = await seed();
    const outsider = await joinAt(db, jonah, "Outsider", TUESDAY);
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), outsider.id, TUESDAY);

    const message = await postMessage(db, grandma, family.id, `hi <@${outsider.id}> and <@99999>!`, THURSDAY);

    expect(message.text).toBe("hi @Outsider and !");
    expect(await mentionRows(db)).toEqual([]);
  });

  test("leaves a deactivated Member out of @everyone and out of mentions", async () => {
    const { db, jonah, grandma, family, tom } = await seed();
    await setMemberActive(db, jonah, tom.id, false);

    const message = await postMessage(db, grandma, family.id, `<@everyone> <@${tom.id}>`, THURSDAY);

    expect(message.text).toBe("<@everyone> @Tom Bradley");
    expect(await mentionRows(db)).toEqual([{ messageId: message.id, memberId: jonah.id }]);
  });

  test(`holds the rendered text to ${MAX_CHAT_TEXT} characters, each token counted as its name`, async () => {
    const { db, grandma, family, tom } = await seed();
    const token = `<@${tom.id}>`;
    const name = "@Tom Bradley";

    await postMessage(db, grandma, family.id, `${"a".repeat(MAX_CHAT_TEXT - name.length)}${token}`, at(0));
    await expect(postMessage(db, grandma, family.id, `${"a".repeat(MAX_CHAT_TEXT - name.length + 1)}${token}`, at(1))).rejects.toThrow(
      new InvalidChat(`A message is at most ${MAX_CHAT_TEXT} characters.`),
    );
  });

  test("does not count the zero-width space that keeps a typed-out token plain, as the composer does not", async () => {
    const { db, grandma, family } = await seed();
    const typed = "<​@everyone>";

    const message = await postMessage(db, grandma, family.id, `${"a".repeat(MAX_CHAT_TEXT - 11)}${typed}`, THURSDAY);

    expect(message.text.endsWith(typed)).toBe(true);
  });

  test("keeps a message whose tokens make it longer than it reads", async () => {
    const { db, grandma, family } = await seed();
    const text = "<@everyone>".repeat(30);

    const message = await postMessage(db, grandma, family.id, text, THURSDAY);

    expect(message.text).toBe(text);
    expect([...text].length).toBeGreaterThan(MAX_CHAT_TEXT);
  });

  test("refuses a message that is nothing once a stranger's token is dropped", async () => {
    const { db, grandma, family } = await seed();

    await expect(postMessage(db, grandma, family.id, " <@99999> ", THURSDAY)).rejects.toThrow(new InvalidChat("Say something first."));
    expect(await db.select().from(chatMessages)).toEqual([]);
  });
});

describe("the thread", () => {
  test("names everyone mentioned among its senders, though they never wrote", async () => {
    const { db, grandma, family, tom } = await seed();
    await postMessage(db, grandma, family.id, `<@${tom.id}> say something`, THURSDAY);

    const thread = await chatThread(db, grandma, family.id);

    expect(thread.senders.map((s) => s.displayName).sort()).toEqual(["Grandma", "Tom Bradley"]);
  });

  test("carries the reader's marker as it was before this read: none yet, then the last one they saw", async () => {
    const { db, jonah, grandma, family } = await seed();
    await postMessage(db, jonah, family.id, "one", at(0));
    const two = await postMessage(db, jonah, family.id, "two", at(1));

    const first = await chatThread(db, grandma, family.id);
    expect(first.readId).toBe(0);
    await markRead(db, grandma.id, family.id, first);
    await postMessage(db, jonah, family.id, "<@everyone> three", at(2));

    expect((await chatThread(db, grandma, family.id)).readId).toBe(two.id);
  });

  test("counts a reader who has never opened it from when they joined the Group", async () => {
    const { db, jonah, family } = await seed();
    const before = await postMessage(db, jonah, family.id, "<@everyone> before you came", at(0));
    const late = await joinAt(db, jonah, "Late", at(1));

    expect((await chatThread(db, late, family.id)).readId).toBe(before.id);
  });
});

describe("the picker's people", () => {
  test("are the Group's active Members now, with Commissioner or Organizer beside them", async () => {
    const { db, jonah, grandma, family, tom } = await seed();
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await removeFromGroup(db, await manageGroup(db, jonah, family.id), gone.id, TUESDAY);
    const asleep = await joinAt(db, jonah, "Asleep", TUESDAY);
    await setMemberActive(db, jonah, asleep.id, false);
    await db.update(memberships).set({ role: "organizer" }).where(eq(memberships.memberId, tom.id));

    const people = await mentionPeople(db, grandma, family.id);

    expect(people.map((p) => [p.member.displayName, p.role]).sort()).toEqual([
      ["Grandma", ""],
      ["Jonah", "Commissioner"],
      ["Tom Bradley", "Organizer"],
    ]);
  });
});

describe("deleting messages clears their mentions first", () => {
  test("the season wipe", async () => {
    const { db, grandma, family, tom } = await seed();
    await postMessage(db, grandma, family.id, `<@${tom.id}> <@everyone>`, THURSDAY);

    await startSeason(db, 2027);

    expect(await mentionRows(db)).toEqual([]);
    expect(await db.select().from(chatMessages)).toEqual([]);
  });

  test("deleting a Member, who sent mentions and was mentioned", async () => {
    const { db, jonah, grandma, family, tom } = await seed();
    const kept = await postMessage(db, jonah, family.id, `<@${grandma.id}> hi`, at(0));
    await postMessage(db, tom, family.id, `<@${grandma.id}> from Tom`, at(1));
    await postMessage(db, grandma, family.id, `<@${tom.id}> back`, at(2));
    await setMemberActive(db, jonah, tom.id, false);

    await removeMember(db, jonah, tom.id);

    expect(await mentionRows(db)).toEqual([{ messageId: kept.id, memberId: grandma.id }]);
  });

  test("deleting a Group", async () => {
    const { db, jonah, grandma } = await seed();
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY);
    await postMessage(db, grandma, cousins.id, "<@everyone> bye", THURSDAY);

    await deleteGroup(db, jonah, cousins.id, "Cousins");

    expect(await mentionRows(db)).toEqual([]);
  });

  test("but a message taken down keeps them, hidden behind its placeholder", async () => {
    const { db, grandma, family, tom } = await seed();
    const message = await postMessage(db, grandma, family.id, `<@${tom.id}> oops`, THURSDAY);

    await takeDown(db, grandma, family.id, message.id, at(1));

    expect(await mentionRows(db)).toEqual([{ messageId: message.id, memberId: tom.id }]);
    const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, message.id));
    expect(row.deletedAt).not.toBeNull();
  });
});
