/**
 * Feedback (#237) through the doors it comes in and goes out by: the You
 * screen's form, the console's list and Done buttons, the screenshot route,
 * and a member's deletion.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { feedback, feedbackScreenshots, memberships, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { form, routeFor } from "@/test/console";
import { jpeg, png } from "@/test/photo";
import { seedWeek2, THURSDAY } from "@/test/week-2";
import { listFeedback, openFeedbackCount, serveScreenshot } from "./feedback";
import { DAILY_FEEDBACK_LIMIT, MAX_FEEDBACK_TEXT, MAX_SCREENSHOT_BYTES } from "./limits";
import { markFromForm, sendFromForm } from "./route";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const HOUR = 60 * 60 * 1000;

/** Posts the send form as `member` at `now`, the way `sendFeedbackAction` does. */
function send(db: Db, member: Member, fields: { kind?: string; text?: string; screenshot?: Uint8Array }, now = THURSDAY) {
  const data = new FormData();
  data.append("kind", fields.kind ?? "bug");
  data.append("text", fields.text ?? "The board froze on the 3:30 games.");
  if (fields.screenshot) data.append("screenshot", new File([fields.screenshot.slice()], "screenshot.jpg", { type: "image/jpeg" }));
  return sendFromForm({ db, requireMember: async () => member, userAgent: async () => IPHONE, now: () => now }, data);
}

function fetchAs(db: Db, viewer: Member | null, id: number | string) {
  return serveScreenshot({ db, currentMember: async () => viewer }, { id: String(id) });
}

async function rows(db: Db) {
  return db.select().from(feedback);
}

describe("sending feedback", () => {
  test("keeps the kind, the trimmed text and the user agent, and says it was sent", async () => {
    const { db, jonah, grandma } = await seedWeek2();

    const state = await send(db, grandma, { kind: "idea", text: "  A dark mode for night games.\n" });

    const [row] = await rows(db);
    expect(state).toEqual({ sent: row.id });
    expect(row).toMatchObject({
      memberId: grandma.id,
      kind: "idea",
      text: "A dark mode for night games.",
      userAgent: IPHONE,
      createdAt: THURSDAY,
      doneAt: null,
    });
    const [item] = await listFeedback(db, jonah);
    expect(item).toMatchObject({ id: row.id, hasScreenshot: false, member: { id: grandma.id, displayName: "Grandma" } });
  });

  test("stores a screenshot with its row, served to a commissioner and never cached", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const shot = await jpeg({ width: 739, height: 1600 });

    const { sent } = await send(db, grandma, { screenshot: shot });

    const [item] = await listFeedback(db, jonah);
    expect(item.hasScreenshot).toBe(true);
    const response = await fetchAs(db, jonah, sent!);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(shot);
  });

  test.each([
    ["no kind", { kind: "" }, "Choose Bug or Idea, and say a few words."],
    ["a kind that is not Bug or Idea", { kind: "complaint" }, "Choose Bug or Idea, and say a few words."],
    ["no text", { text: "" }, "Choose Bug or Idea, and say a few words."],
    ["only spaces", { text: "   \n " }, "Choose Bug or Idea, and say a few words."],
    ["too much text", { text: "x".repeat(MAX_FEEDBACK_TEXT + 1) }, `Keep it to 1000 characters. That’s 1001.`],
  ])("refuses %s, and records nothing", async (_, fields, message) => {
    const { db, grandma } = await seedWeek2();

    expect(await send(db, grandma, fields)).toEqual({ error: message });
    expect(await rows(db)).toEqual([]);
  });

  test("takes exactly 1000 characters", async () => {
    const { db, grandma } = await seedWeek2();

    expect(await send(db, grandma, { text: "x".repeat(MAX_FEEDBACK_TEXT) })).toHaveProperty("sent");
  });

  test("refuses a screenshot that is not a JPEG, and records nothing", async () => {
    const { db, grandma } = await seedWeek2();

    expect(await send(db, grandma, { screenshot: await png() })).toEqual({
      error: "That screenshot couldn’t be read. Choose it again.",
    });
    expect(await rows(db)).toEqual([]);
    expect(await db.select().from(feedbackScreenshots)).toEqual([]);
  });

  test("refuses a screenshot over the size limit before reading it", async () => {
    const { db, grandma } = await seedWeek2();
    const huge = new Uint8Array(MAX_SCREENSHOT_BYTES + 1);
    huge.set([0xff, 0xd8, 0xff]);

    expect(await send(db, grandma, { screenshot: huge })).toEqual({
      error: "That screenshot is too large. Choose it again.",
    });
    expect(await rows(db)).toEqual([]);
  });
});

describe("the daily limit", () => {
  test("allows the 10th in a day and refuses the 11th", async () => {
    const { db, grandma } = await seedWeek2();
    for (let i = 0; i < DAILY_FEEDBACK_LIMIT; i++) {
      expect(await send(db, grandma, {}, new Date(THURSDAY.getTime() + i * HOUR))).toHaveProperty("sent");
    }

    expect(await send(db, grandma, {}, new Date(THURSDAY.getTime() + 12 * HOUR))).toEqual({
      error: "You’ve sent 10 today, the most in a day. Try again tomorrow.",
    });
    expect(await rows(db)).toHaveLength(DAILY_FEEDBACK_LIMIT);
  });

  test("rolls: a day after the first, one more goes", async () => {
    const { db, grandma } = await seedWeek2();
    for (let i = 0; i < DAILY_FEEDBACK_LIMIT; i++) await send(db, grandma, {}, new Date(THURSDAY.getTime() + i * HOUR));

    const dayAfterFirst = new Date(THURSDAY.getTime() + 24 * HOUR);
    expect(await send(db, grandma, {}, dayAfterFirst)).toHaveProperty("sent");
    expect(await send(db, grandma, {}, dayAfterFirst)).toHaveProperty("error");
  });

  test("is each member's own", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    for (let i = 0; i < DAILY_FEEDBACK_LIMIT; i++) await send(db, grandma, {});

    expect(await send(db, jonah, {})).toHaveProperty("sent");
  });
});

describe("reading it in the console", () => {
  test("lists newest first, and Done files one away from the count and back", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const { sent: first } = await send(db, grandma, { text: "first" });
    const { sent: second } = await send(db, jonah, { text: "second" }, new Date(THURSDAY.getTime() + HOUR));
    const { route, revalidated } = routeFor(db, jonah, new Date(THURSDAY.getTime() + 2 * HOUR));

    expect((await listFeedback(db, jonah)).map((i) => i.id)).toEqual([second, first]);
    expect(await openFeedbackCount(db, jonah)).toBe(2);

    await markFromForm(route, form({ feedbackId: first!, done: "true" }));
    expect(await openFeedbackCount(db, jonah)).toBe(1);
    expect((await listFeedback(db, jonah)).find((i) => i.id === first)!.doneAt).toEqual(
      new Date(THURSDAY.getTime() + 2 * HOUR),
    );
    expect(revalidated).toEqual(["/console/feedback"]);

    await markFromForm(route, form({ feedbackId: first!, done: "false" }));
    expect(await openFeedbackCount(db, jonah)).toBe(2);
    expect((await listFeedback(db, jonah)).find((i) => i.id === first)!.doneAt).toBeNull();
  });

  test("Done on feedback that is gone is a fault, not a message", async () => {
    const { db, jonah } = await seedWeek2();
    const { route } = routeFor(db, jonah, THURSDAY);

    await expect(markFromForm(route, form({ feedbackId: 999, done: "true" }))).rejects.toThrow("That feedback is gone.");
  });

  test("a screenshot is a 404 to anyone but a commissioner, organizers included", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const { sent } = await send(db, grandma, { screenshot: await jpeg() });
    await db.update(memberships).set({ role: "organizer" }).where(eq(memberships.memberId, grandma.id));
    const retired = { ...jonah, active: false } as Commissioner;

    for (const viewer of [null, grandma, retired]) {
      const response = await fetchAs(db, viewer, sent!);
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect((await fetchAs(db, jonah, sent!)).status).toBe(200);
  });

  test("a screenshot that does not exist is a 404, and so is an id that is not one", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const { sent } = await send(db, grandma, {});

    for (const id of [sent!, 999, "abc", "0", "-1"]) expect((await fetchAs(db, jonah, id)).status).toBe(404);
  });
});

describe("deleting a member", () => {
  test("takes their feedback and its screenshots with them, and leaves everyone else's", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await send(db, grandma, { screenshot: await jpeg() });
    await send(db, grandma, {});
    const { sent: kept } = await send(db, jonah, { screenshot: await jpeg({ seed: 2 }) });
    await setMemberActive(db, jonah, grandma.id, false);

    await removeMember(db, jonah, grandma.id);

    expect((await rows(db)).map((r) => r.id)).toEqual([kept]);
    expect(await db.select({ id: feedbackScreenshots.feedbackId }).from(feedbackScreenshots)).toEqual([{ id: kept }]);
  });
});
