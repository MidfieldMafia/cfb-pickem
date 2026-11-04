/**
 * The New Feedback push (#533) through the send form's seam: a member sends
 * Feedback, then the push runs as the form's `after()` would run it, observed
 * through a recording push sender. Who gets it, who never does, and what it says.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { members, pushSubscriptions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Pusher, PushPayload, PushTarget } from "@/lib/push/sender";
import { joinAt, seedWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { pushNewFeedback } from "./push";
import { sendFromForm } from "./route";

interface Sent {
  endpoint: string;
  payload: PushPayload;
  ttl: number;
}

function pusher(): Pusher & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(target: PushTarget, payload, { ttl }) {
      sent.push({ endpoint: target.endpoint, payload, ttl });
      return "sent";
    },
  };
}

const endpoint = (m: Pick<Member, "displayName">) => `https://web.push.apple.com/${m.displayName.toLowerCase()}`;

async function device(db: Db, m: Member) {
  await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: endpoint(m), p256dh: "key", auth: "secret" });
}

async function makeCommissioner(db: Db, m: Member): Promise<Member> {
  await db.update(members).set({ isCommissioner: true }).where(eq(members.id, m.id));
  return { ...m, isCommissioner: true };
}

/** Jonah is the commissioner; Grandma and Katie are members. Everyone has a phone. */
async function seed() {
  const fixture = await seedWeek2();
  const katie = await joinAt(fixture.db, fixture.jonah, "Katie", TUESDAY);
  for (const m of [fixture.jonah, fixture.grandma, katie]) await device(fixture.db, m);
  const push = pusher();
  const pending: (() => Promise<unknown>)[] = [];
  /** `who` sends Feedback through the form, then the work left for after the response runs. */
  const send = async (who: Member, kind: string, text: string) => {
    const data = new FormData();
    data.append("kind", kind);
    data.append("text", text);
    const state = await sendFromForm(
      {
        db: fixture.db,
        requireMember: async () => who,
        userAgent: async () => "test",
        now: () => THURSDAY,
        pusher: () => push,
        afterResponse: (task) => pending.push(task),
      },
      data,
    );
    for (const task of pending.splice(0)) await task();
    return state;
  };
  const to = (m: Member) => push.sent.filter((s) => s.endpoint === endpoint(m)).map((s) => s.payload);
  return { ...fixture, katie, push, send, to };
}

describe("New Feedback", () => {
  test("pushes a member's bug to the commissioner, with the first line and the console link", async () => {
    const { jonah, grandma, send, to } = await seed();

    const state = await send(grandma, "bug", "The board froze on the 3:30 games.\nI had to close the app.");

    expect(to(jonah)).toEqual([
      {
        title: "Grandma sent a bug",
        body: "The board froze on the 3:30 games.",
        url: "/console/feedback",
        tag: `feedback-${state.sent}`,
      },
    ]);
  });

  test("says an idea is an idea, and carries the first line that says something", async () => {
    const { jonah, katie, send, to } = await seed();

    await send(katie, "idea", "\n  A dark mode for night games.  \nPlease.");

    expect(to(jonah)).toMatchObject([{ title: "Katie sent an idea", body: "A dark mode for night games." }]);
  });

  test("cuts a long first line at about 120 characters", async () => {
    const { jonah, grandma, send, to } = await seed();

    await send(grandma, "bug", `${"word ".repeat(40)}end`);

    const [push] = to(jonah);
    expect([...push.body].length).toBeLessThanOrEqual(120);
    expect(push.body.endsWith("word…")).toBe(true);
  });

  test("goes out only after the response, and only once", async () => {
    const { db, jonah, grandma, push, to } = await seed();
    const pending: (() => Promise<unknown>)[] = [];
    const data = new FormData();
    data.append("kind", "bug");
    data.append("text", "Picks page is blank.");

    const state = await sendFromForm(
      {
        db,
        requireMember: async () => grandma,
        userAgent: async () => "test",
        now: () => THURSDAY,
        pusher: () => push,
        afterResponse: (task) => pending.push(task),
      },
      data,
    );
    expect(push.sent).toEqual([]);
    for (const task of pending) await task();
    await pushNewFeedback(db, push, state.sent ?? 0, THURSDAY);

    expect(to(jonah)).toHaveLength(1);
  });

  test("a commissioner's own Feedback goes to the other commissioners, never back to them", async () => {
    const { db, jonah, katie, send, to } = await seed();
    const commissionerKatie = await makeCommissioner(db, katie);

    await send(jonah, "bug", "Console is slow.");

    expect(to(jonah)).toEqual([]);
    expect(to(commissionerKatie)).toMatchObject([{ title: "Jonah sent a bug", body: "Console is slow." }]);
  });

  test("a member's New Feedback setting, on by default, sends them nothing", async () => {
    const { grandma, katie, send, to } = await seed();

    await send(katie, "idea", "More emoji.");

    expect(grandma.notifyFeedback).toBe(true);
    expect(to(grandma)).toEqual([]);
  });

  test("a commissioner with New Feedback off, or no longer active, is not pushed", async () => {
    const { db, jonah, grandma, katie, send, push } = await seed();
    await db.update(members).set({ notifyFeedback: false }).where(eq(members.id, jonah.id));
    await makeCommissioner(db, katie);
    await db.update(members).set({ active: false }).where(eq(members.id, katie.id));

    await send(grandma, "bug", "Nothing loads.");

    expect(push.sent).toEqual([]);
  });

  test("waits a day for a phone that is off", async () => {
    const { grandma, send, push } = await seed();

    await send(grandma, "bug", "Nothing loads.");

    expect(push.sent.map((s) => s.ttl)).toEqual([24 * 60 * 60]);
  });
});
