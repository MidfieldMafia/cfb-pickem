/**
 * Chat pushes (#530) through the server seam: a message posted, then
 * `pushChatMessage` as the post's `after()` runs it, observed through a
 * recording push sender. Who gets what under each setting, watching,
 * catch-up, a mention of yourself and `@everyone`.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ChatNotification, Member } from "@/db/schema";
import type { Pusher, PushPayload, PushTarget, SendOutcome } from "@/lib/push/sender";
import { joinAt, familyGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { chatThread, markRead, postMessage } from "./chat";
import { pushChatMessage } from "./push";

const SECOND = 1000;
const at = (seconds: number) => new Date(THURSDAY.getTime() + seconds * SECOND);

interface Sent {
  endpoint: string;
  payload: PushPayload;
  ttl: number;
}

/** Records each send; an endpoint in `answers` gets that outcome instead of `sent`. */
function pusher(answers: Record<string, SendOutcome> = {}): Pusher & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(target: PushTarget, payload, { ttl }) {
      const answer = answers[target.endpoint] ?? "sent";
      if (answer === "sent") sent.push({ endpoint: target.endpoint, payload, ttl });
      return answer;
    },
  };
}

const endpoint = (m: Pick<Member, "displayName">) => `https://web.push.apple.com/${m.displayName.toLowerCase().replace(/\W/g, "")}`;

async function device(db: Db, m: Member) {
  await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: endpoint(m), p256dh: "key", auth: "secret" });
}

async function setChat(db: Db, m: Member, value: ChatNotification) {
  await db.update(members).set({ notifyChat: value }).where(eq(members.id, m.id));
}

/** Katie posts in Mabry Family; Jonah, Grandma and Tom read it, each with a phone. */
async function seed() {
  const fixture = await seedWeek2();
  const family = await familyGroup(fixture.db);
  const katie = await joinAt(fixture.db, fixture.jonah, "Katie", TUESDAY);
  const tom = await joinAt(fixture.db, fixture.jonah, "Tom", TUESDAY);
  for (const m of [fixture.jonah, fixture.grandma, katie, tom]) await device(fixture.db, m);
  const push = pusher();
  /** Katie (or `from`) posts `text` at `when`, and the post's pushes run. */
  const post = async (text: string, when: Date, from: Member = katie) => {
    const message = await postMessage(fixture.db, from, family.id, text, when);
    await pushChatMessage(fixture.db, push, { ...message, groupId: family.id }, when);
    return message;
  };
  /** `who` opens the thread at `when`, as the Chat screen and its poll do. */
  const read = async (who: Member, when: Date) => markRead(fixture.db, who.id, family.id, await chatThread(fixture.db, who, family.id), when);
  const to = (m: Member) => push.sent.filter((s) => s.endpoint === endpoint(m)).map((s) => s.payload);
  return { ...fixture, family, katie, tom, push, post, read, to };
}

describe("an @mention", () => {
  test("pushes to the Member it names under the default, with the text as it reads", async () => {
    const { tom, jonah, grandma, katie, family, post, to } = await seed();

    const message = await post(`<@${tom.id}> you owe me a pick`, at(0));

    expect(to(tom)).toEqual([
      {
        title: "Katie mentioned you in Mabry Family",
        body: "@Tom you owe me a pick",
        url: `/go?group=${family.id}&to=/chat`,
        tag: `mention-${message.id}`,
      },
    ]);
    expect([...to(jonah), ...to(grandma), ...to(katie)]).toEqual([]);
  });
});

describe("who a message pushes to, by their Chat setting", () => {
  test("Off gets nothing, a mention included; @mentions gets nothing for a plain message; All gets it", async () => {
    const { db, jonah, grandma, tom, katie, family, post, to } = await seed();
    await setChat(db, jonah, "all");
    await setChat(db, grandma, "off");

    await post(`<@${grandma.id}> lunch?`, at(0));

    expect(to(grandma)).toEqual([]);
    expect(to(tom)).toEqual([]);
    expect(to(katie)).toEqual([]);
    expect(to(jonah)).toEqual([
      { title: "Mabry Family", body: "Katie: @Grandma lunch?", url: `/go?group=${family.id}&to=/chat`, tag: `chat-${family.id}` },
    ]);
  });

  test("never pushes to the author, nor to a Member with no device", async () => {
    const { db, katie, tom, post, push } = await seed();
    await setChat(db, katie, "all");
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.memberId, tom.id));

    await post(`<@${tom.id}> hi`, at(0));

    expect(push.sent).toEqual([]);
  });

  test("a mention of yourself never sends", async () => {
    const { katie, post, push } = await seed();

    await post(`<@${katie.id}> note to self`, at(0));

    expect(push.sent).toEqual([]);
  });
});

describe("@everyone", () => {
  test("pushes to every Member but the author and those with Chat Off, titled as everyone", async () => {
    const { db, jonah, grandma, tom, katie, family, post, to } = await seed();
    await setChat(db, tom, "off");

    const message = await post("<@everyone> picks lock at 11", at(0));

    const pushed = { title: "Katie mentioned everyone in Mabry Family", body: "@everyone picks lock at 11", url: `/go?group=${family.id}&to=/chat`, tag: `mention-${message.id}` };
    expect(to(jonah)).toEqual([pushed]);
    expect(to(grandma)).toEqual([pushed]);
    expect([...to(tom), ...to(katie)]).toEqual([]);
  });

  test("a Member named as well as everyone is told they were mentioned", async () => {
    const { jonah, grandma, post, to } = await seed();

    await post(`<@everyone> and <@${grandma.id}> especially`, at(0));

    expect(to(grandma).map((p) => p.title)).toEqual(["Katie mentioned you in Mabry Family"]);
    expect(to(jonah).map((p) => p.title)).toEqual(["Katie mentioned everyone in Mabry Family"]);
  });
});

describe("watching", () => {
  test("skips a Member who read the thread in the last 15 s, and not one who read before that", async () => {
    const { jonah, grandma, post, read, to } = await seed();
    await read(jonah, at(-14));
    await read(grandma, at(-16));

    await post("<@everyone> who's up", at(0));

    expect(to(jonah)).toEqual([]);
    expect(to(grandma)).toHaveLength(1);
  });

  test("an open thread's poll keeps a Member watching though no message is new", async () => {
    const { tom, post, read, to } = await seed();
    await post("first", at(0));
    await read(tom, at(10));
    await read(tom, at(40));

    await post(`<@${tom.id}> you there`, at(50));

    expect(to(tom)).toEqual([]);
  });
});

describe("All messages: one push per catch-up", () => {
  test("pushes the first message since the Member last read, then nothing until they open the Chat", async () => {
    const { db, jonah, post, read, to } = await seed();
    await setChat(db, jonah, "all");

    await post("one", at(0));
    await post("two", at(60));
    expect(to(jonah).map((p) => p.body)).toEqual(["Katie: one"]);

    await read(jonah, at(120));
    await post("three", at(200));
    await post("four", at(260));
    expect(to(jonah).map((p) => p.body)).toEqual(["Katie: one", "Katie: three"]);
  });

  test("counts what is unread when the catch-up push goes", async () => {
    const { db, jonah, grandma, post, read, to } = await seed();
    await setChat(db, jonah, "all");
    await read(jonah, at(0));
    // Jonah is watching for these two, then closes the app before his poll reads them.
    await post("one", at(5));
    await post("two", at(10), grandma);

    await post("three", at(100));

    expect(to(jonah).map((p) => p.body)).toEqual(["3 new messages · Katie: three"]);
  });

  test("a mention is the catch-up push, so the next plain message is quiet", async () => {
    const { db, jonah, post, read, to } = await seed();
    await setChat(db, jonah, "all");

    await post(`<@${jonah.id}> look`, at(0));
    await post("and this", at(60));
    expect(to(jonah).map((p) => p.title)).toEqual(["Katie mentioned you in Mabry Family"]);

    await read(jonah, at(120));
    await post("after reading", at(200));
    expect(to(jonah).map((p) => p.body)).toEqual(["@Jonah look", "Katie: after reading"]);
  });

  test("a mention still pushes after the catch-up push has gone", async () => {
    const { db, jonah, post, to } = await seed();
    await setChat(db, jonah, "all");

    await post("one", at(0));
    await post(`<@${jonah.id}> two`, at(60));

    expect(to(jonah).map((p) => p.tag)).toEqual([expect.stringMatching(/^chat-/), expect.stringMatching(/^mention-/)]);
  });
});

describe("reserved before it goes", () => {
  test("a message's pushes run twice send once", async () => {
    const { db, jonah, tom, family, katie, push } = await seed();
    await setChat(db, jonah, "all");
    const message = await postMessage(db, katie, family.id, `<@${tom.id}> once`, at(0));

    await Promise.all([
      pushChatMessage(db, push, { ...message, groupId: family.id }, at(0)),
      pushChatMessage(db, push, { ...message, groupId: family.id }, at(0)),
    ]);

    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([endpoint(jonah), endpoint(tom)].sort());
    expect(push.sent.every((s) => s.ttl === 24 * 60 * 60)).toBe(true);
  });

  test("cuts a long message at about 120 characters", async () => {
    const { tom, post, to } = await seed();

    await post(`<@${tom.id}> ${"word ".repeat(40)}`, at(0));

    const [{ body }] = to(tom);
    expect([...body].length).toBeLessThanOrEqual(120);
    expect(body.startsWith("@Tom word word")).toBe(true);
    expect(body.endsWith("…")).toBe(true);
  });
});
