/**
 * The Chat API as the phone meets it: the thread with its ETag, posting, the
 * badge's count, and the refusals each answers with.
 */
import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { eq } from "drizzle-orm";
import { chatMessages } from "@/db/schema";
import { manageGroup, removeFromGroup } from "@/lib/groups/manage";
import { addGroup, familyGroup, joinGroup, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { postMessage } from "./chat";
import { getChat, getChatUnread, postChat, type ChatRoute } from "./http";
import type { ChatStateJson } from "./json";

function routeFor(db: Db, member: Member | null, group: number | null): ChatRoute {
  return { db, currentMember: async () => member, currentGroup: async () => group, now: () => THURSDAY };
}

const get = (group: number | string | null, etag?: string) =>
  new Request(`http://test/api/chat${group === null ? "" : `?group=${group}`}`, { headers: etag ? { "if-none-match": etag } : {} });
const post = (body: unknown) =>
  new Request("http://test/api/chat", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("GET /api/chat", () => {
  test("answers the thread, and a 304 while it has not changed", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "Picks are up", THURSDAY);
    const route = routeFor(db, grandma, family.id);

    const first = await getChat(get(family.id), route);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const state = (await first.json()) as ChatStateJson;
    expect(state.messages.map((m) => m.text)).toEqual(["Picks are up"]);
    expect(state.serverNow).toBe(THURSDAY.toISOString());

    const etag = first.headers.get("etag")!;
    expect((await getChat(get(family.id, etag), route)).status).toBe(304);

    await postMessage(db, jonah, family.id, "Get them in", THURSDAY);
    expect((await getChat(get(family.id, etag), route)).status).toBe(200);
  });

  test("marks the thread read", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    await postMessage(db, jonah, family.id, "Hello", THURSDAY);
    const route = routeFor(db, grandma, family.id);

    expect(await (await getChatUnread(route)).json()).toEqual({ unread: 1 });
    await getChat(get(family.id), route);
    expect(await (await getChatUnread(route)).json()).toEqual({ unread: 0 });
  });

  test("401 signed out, 404 naming no group, 403 once removed", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    expect((await getChat(get(family.id), routeFor(db, null, family.id))).status).toBe(401);
    expect((await getChat(get(null), routeFor(db, grandma, family.id))).status).toBe(404);
    expect((await getChat(get("abc"), routeFor(db, grandma, family.id))).status).toBe(404);

    await removeFromGroup(db, await manageGroup(db, jonah, family.id), grandma.id, THURSDAY);
    const removed = await getChat(get(family.id), routeFor(db, grandma, family.id));
    expect(removed.status).toBe(403);
    expect(await removed.json()).toEqual({ error: "You are not in this group any more." });
  });
});

describe("POST /api/chat", () => {
  test("posts as the signed-in member and answers the thread with it", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    const response = await postChat(post({ group: family.id, text: "Roll Tide" }), routeFor(db, grandma, family.id));

    expect(response.status).toBe(200);
    const state = (await response.json()) as ChatStateJson;
    expect(state.messages).toEqual([expect.objectContaining({ memberId: grandma.id, text: "Roll Tide" })]);
    expect(state.senders.map((s) => s.id)).toEqual([grandma.id]);
  });

  test.each([
    ["too long", { text: "a".repeat(281) }, "A message is at most 280 characters."],
    ["empty", { text: " " }, "Say something first."],
    ["no text", {}, "Say something first."],
  ])("answers 400 with the sentence when %s", async (_, body, error) => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    const response = await postChat(post({ group: family.id, ...body }), routeFor(db, grandma, family.id));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });

  test("answers 404 when the body names no group, JSON or not", async () => {
    const { db, grandma } = await seedWeek2();
    const family = await familyGroup(db);

    expect((await postChat(post({ text: "Hi" }), routeFor(db, grandma, family.id))).status).toBe(404);
    expect((await postChat(post("text=hi"), routeFor(db, grandma, family.id))).status).toBe(404);
  });

  test("posts to the Group the thread names, never the device's remembered one", async () => {
    // Removed from Cousins with its thread still open: the device's remembered
    // group has fallen back to Mabry Family, and the message must not land there.
    const { db, jonah, grandma } = await seedWeek2();
    const family = await familyGroup(db);
    const cousins = await addGroup(db, "Cousins");
    await joinGroup(db, cousins, grandma, TUESDAY);
    await joinGroup(db, cousins, jonah, TUESDAY, "organizer");
    await removeFromGroup(db, await manageGroup(db, jonah, cousins.id), grandma.id, THURSDAY);

    const response = await postChat(post({ group: cousins.id, text: "Anyone here?" }), routeFor(db, grandma, family.id));

    expect(response.status).toBe(403);
    expect(await db.select().from(chatMessages).where(eq(chatMessages.groupId, family.id))).toEqual([]);
    expect(await db.select().from(chatMessages)).toEqual([]);
  });
});
