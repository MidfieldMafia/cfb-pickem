/**
 * The console's Send a push through its form seam, observed through a
 * recording push sender: who it reaches, who is named as missed, what the
 * banner says, and that a second press of the same form sends nothing twice.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, pushSubscriptions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { form, routeFor } from "@/test/console";
import { joinAt, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { sendPushFromForm } from "./console-edits";
import { customPushSummary } from "./custom";
import { MAX_PUSH_TITLE } from "./custom-fields";
import type { Pusher, PushPayload, PushTarget, SendOutcome } from "./sender";

interface Sent {
  endpoint: string;
  payload: PushPayload;
  ttl: number;
}

function pusher(outcome: (target: PushTarget) => SendOutcome = () => "sent"): Pusher & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(target, payload, { ttl }) {
      sent.push({ endpoint: target.endpoint, payload, ttl });
      return outcome(target);
    },
  };
}

const endpoint = (m: Pick<Member, "displayName">) => `https://web.push.apple.com/${m.displayName.toLowerCase()}`;

async function device(db: Db, m: Member) {
  await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: endpoint(m), p256dh: "key", auth: "secret" });
}

/** Jonah is the commissioner; Grandma and Katie have phones, Bo has none. */
async function seed() {
  const fixture = await seedWeek2();
  const katie = await joinAt(fixture.db, fixture.jonah, "Katie", TUESDAY);
  const bo = await joinAt(fixture.db, fixture.jonah, "Bo", TUESDAY);
  for (const m of [fixture.grandma, katie]) await device(fixture.db, m);
  const { route, revalidated } = routeFor(fixture.db, fixture.jonah, THURSDAY);
  return { ...fixture, katie, bo, route, revalidated };
}

function posted(memberIds: number[], fields: Record<string, string> = {}): FormData {
  const data = form({ title: "Bowl picks open", body: "Get yours in by Friday.", url: "/picks", sendId: "send-0001", ...fields });
  for (const id of memberIds) data.append("memberId", String(id));
  return data;
}

describe("a commissioner's own push from the console", () => {
  test("goes to each chosen member's phone, and names who had none", async () => {
    const { route, revalidated, grandma, katie, bo } = await seed();
    const push = pusher();

    const state = await sendPushFromForm(route, push, posted([grandma.id, katie.id, bo.id]));

    expect(state).toEqual({ done: "Pushed Grandma and Katie. Bo has no phone taking pushes." });
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([endpoint(grandma), endpoint(katie)]);
    expect(push.sent[0].payload).toEqual({
      title: "Bowl picks open",
      body: "Get yours in by Friday.",
      url: "/picks",
      tag: "custom-send-0001",
    });
    expect(push.sent[0].ttl).toBe(24 * 60 * 60);
    expect(revalidated).toEqual(["/console/push"]);
  });

  test("reaches only the members ticked", async () => {
    const { route, katie } = await seed();
    const push = pusher();

    await sendPushFromForm(route, push, posted([katie.id]));

    expect(push.sent.map((s) => s.endpoint)).toEqual([endpoint(katie)]);
  });

  test("a second press of the same form sends nothing twice; a fresh form sends again", async () => {
    const { route, grandma } = await seed();
    const push = pusher();

    await sendPushFromForm(route, push, posted([grandma.id]));
    expect(await sendPushFromForm(route, push, posted([grandma.id]))).toEqual({ done: "Already sent to Grandma." });
    expect(push.sent).toHaveLength(1);

    await sendPushFromForm(route, push, posted([grandma.id], { sendId: "send-0002" }));
    expect(push.sent).toHaveLength(2);
  });

  test("a push no device took is a refusal, so the form keeps its text, and the same form can try again", async () => {
    const { route, grandma } = await seed();
    const failing = pusher(() => "failed");

    expect(await sendPushFromForm(route, failing, posted([grandma.id]))).toEqual({
      error: "Grandma has no phone taking pushes.",
    });
    const working = pusher();
    expect(await sendPushFromForm(route, working, posted([grandma.id]))).toEqual({ done: "Pushed Grandma." });
  });

  test("is refused, as a sentence, for a missing field, a stranger link or nobody chosen", async () => {
    const { route, revalidated, grandma } = await seed();
    const push = pusher();

    expect(await sendPushFromForm(route, push, posted([grandma.id], { title: "  " }))).toEqual({ error: "Give the push a title." });
    expect(await sendPushFromForm(route, push, posted([grandma.id], { title: "x".repeat(MAX_PUSH_TITLE + 1) }))).toEqual({
      error: `Keep the title to ${MAX_PUSH_TITLE} characters.`,
    });
    expect(await sendPushFromForm(route, push, posted([grandma.id], { body: "" }))).toEqual({ error: "Write the message." });
    expect(await sendPushFromForm(route, push, posted([grandma.id], { url: "https://example.com" }))).toEqual({
      error: "Choose where a tap opens.",
    });
    expect(await sendPushFromForm(route, push, posted([]))).toEqual({ error: "Choose at least one member." });
    expect(await sendPushFromForm(route, push, posted(["x" as unknown as number]))).toEqual({ error: "Choose members from the list." });
    expect(push.sent).toEqual([]);
    expect(revalidated).toEqual([]);
  });

  test("never reaches a deactivated member", async () => {
    const { db, route, grandma } = await seed();
    await db.update(members).set({ active: false }).where(eq(members.id, grandma.id));
    const push = pusher();

    expect(await sendPushFromForm(route, push, posted([grandma.id]))).toEqual({
      error: "Someone chosen is no longer an active member. Reload the page.",
    });
    expect(push.sent).toEqual([]);
  });

  test("says push is off on a server without the keys", async () => {
    const { route, grandma } = await seed();

    expect(await sendPushFromForm(route, null, posted([grandma.id]))).toEqual({
      error: "Push isn't set up on this server: the WEB_PUSH_* keys are unset.",
    });
  });
});

describe("the sentence under Send", () => {
  const m = (displayName: string) => ({ displayName }) as Member;

  test("lists three or more names with a comma", () => {
    expect(customPushSummary({ reached: [m("A"), m("B"), m("C")], missed: [], repeated: [] })).toBe("Pushed A, B and C.");
  });
});
