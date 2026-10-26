/**
 * Who is texted and who is reminded, over the no-op and recording senders: the
 * Magic Link's audience, the month's budget, the opt-out and the log, and the
 * Pick reminder by push with the scheduled run's window. Nothing here reaches a
 * provider.
 */
import { describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { members, pushMessages, pushSubscriptions, textMessages, type ReminderChannel } from "@/db/schema";
import type { Db } from "@/db/types";
import { setMemberActive, setPhone, setSmsOptedOut, removeMember } from "@/lib/members/members";
import { pickReport } from "@/lib/picks/console";
import { guessAs, joinAt, lockAs, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { toE164 } from "./phone";
import type { Pusher, PushTarget, SendOutcome } from "@/lib/push/sender";
import { noopSender, type SmsSender } from "./sender";
import {
  FREE_TIER_BUDGET,
  MEMBER_MONTHLY_TEXTS,
  monthlyBudget,
  monthStart,
  monthStartDay,
  OPT_OUT_LINE,
  planReminders,
  reminderPush,
  recentTexts,
  remindEveryone,
  reminderSummary,
  runScheduledReminder,
  segmentsOf,
  OWN_LINK_COOLDOWN_MS,
  textBudget,
  textMagicLink,
  textOwnLink,
} from "./texts";

const APP = "https://slate.example";

/** Reminds through `push`, or through nothing when the server has no VAPID keys. */
const by = (push: Pusher | null) => ({ push });

/** A push sender that records each send; an endpoint in `answers` gets that outcome instead of `sent`. */
function pusher(answers: Record<string, SendOutcome> = {}): Pusher & { sent: { endpoint: string; payload: unknown }[] } {
  const sent: { endpoint: string; payload: unknown }[] = [];
  return {
    sent,
    async send(target: PushTarget, payload) {
      const answer = answers[target.endpoint] ?? "sent";
      if (answer === "sent") sent.push({ endpoint: target.endpoint, payload });
      return answer;
    },
  };
}

async function channel(db: Db, memberId: number, to: ReminderChannel) {
  await db.update(members).set({ reminderChannel: to }).where(eq(members.id, memberId));
}

async function device(db: Db, memberId: number, endpoint: string) {
  await db.insert(pushSubscriptions).values({ memberId, endpoint, p256dh: "key", auth: "secret" });
}

/** A sender that records what it was asked to send; `failFor` numbers get a provider error. */
function recorder(failFor: string[] = []): SmsSender & { sent: { to: string; body: string; memberId: number }[] } {
  const sent: { to: string; body: string; memberId: number }[] = [];
  return {
    name: "pingram",
    sent,
    async send(to, body, memberId) {
      if (failFor.includes(to)) return { ok: false, detail: "carrier rejected" };
      sent.push({ to, body, memberId });
      return { ok: true, detail: `track-${sent.length}` };
    },
  };
}

/** Jonah is done; Grandma has one pick; Em has none; Gone is deactivated. */
async function setup() {
  const fixture = await publishWeek2();
  const { db, jonah, slate, michigan, texas, miami } = fixture;
  await setPhone(db, jonah, jonah.id, "(256) 555-0001");
  // Re-read: the fixture's own copy of Grandma predates her number.
  const grandma = await setPhone(db, jonah, fixture.grandma.id, "256-555-0002");
  const em = await joinAt(db, jonah, "Cousin Em", TUESDAY);
  const gone = await joinAt(db, jonah, "Gone", TUESDAY);
  await setMemberActive(db, jonah, gone.id, false);
  for (const game of [michigan, texas, miami]) await pickAs(db, jonah, slate, game, game.homeTeamId, THURSDAY);
  await lockAs(db, jonah, slate, texas.id, THURSDAY);
  await guessAs(db, jonah, slate, 70, THURSDAY);
  await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
  // Everyone starts with the reminder off; Grandma and Em turned it on, each with a phone that takes a push.
  await channel(db, grandma.id, "push");
  await channel(db, em.id, "push");
  await device(db, grandma.id, "https://push.example/grandma");
  await device(db, em.id, "https://push.example/em");
  return { ...fixture, grandma, em, gone };
}

/** A month's worth of already-sent segments, as the log would hold them. */
async function spend(db: Db, memberId: number, segments: number, at: Date, over: Partial<typeof textMessages.$inferInsert> = {}) {
  await db.insert(textMessages).values({
    memberId,
    kind: "reminder",
    phone: "+12565550001",
    provider: "pingram",
    status: "sent",
    segments,
    createdAt: at,
    ...over,
  });
}

describe("phone numbers", () => {
  test.each([
    ["(256) 555-0123", "+12565550123"],
    ["256.555.0123", "+12565550123"],
    ["1 256 555 0123", "+12565550123"],
    ["+44 20 7946 0958", "+442079460958"],
    ["555-0123", null],
    ["012-345-6789", null],
    ["call me", null],
    ["", null],
  ])("%j becomes %j", (raw, e164) => {
    expect(toE164(raw)).toBe(e164);
  });
});

describe("the monthly budget", () => {
  test("stops before the cap: the last segment goes, then the link has to go by hand", async () => {
    const { db, jonah, grandma, em } = await setup();
    const sender = recorder();
    await spend(db, jonah.id, FREE_TIER_BUDGET - 1, THURSDAY);

    expect(await textBudget(db, sender, THURSDAY)).toMatchObject({ used: FREE_TIER_BUDGET - 1, budget: FREE_TIER_BUDGET, remaining: 1 });

    await textMagicLink(db, sender, jonah, grandma.id, APP, THURSDAY);
    await expect(textMagicLink(db, sender, jonah, em.id, APP, THURSDAY)).rejects.toThrow("month's text budget is used up");

    expect(sender.sent.map((s) => s.to)).toEqual([toE164(grandma.phone!)]);
    expect((await textBudget(db, sender, THURSDAY)).remaining).toBe(0);
  });

  test("a paid plan raises the cap from the environment, and the free tier's stop holds when it is unset or nonsense", async () => {
    const { db, jonah } = await setup();
    await spend(db, jonah.id, 200, THURSDAY);

    expect(await textBudget(db, recorder(), THURSDAY, { TEXT_MONTHLY_BUDGET: "1000" })).toMatchObject({ budget: 1000, remaining: 800 });
    expect(monthlyBudget({})).toBe(FREE_TIER_BUDGET);
    expect(monthlyBudget({ TEXT_MONTHLY_BUDGET: "" })).toBe(FREE_TIER_BUDGET);
    expect(monthlyBudget({ TEXT_MONTHLY_BUDGET: "lots" })).toBe(FREE_TIER_BUDGET);
    expect(monthlyBudget({ TEXT_MONTHLY_BUDGET: "0" })).toBe(0);
  });

  test("no member is sent more than their month's share, and the rest are still texted", async () => {
    const { db, jonah, grandma, em } = await setup();
    const sender = recorder();
    await spend(db, grandma.id, MEMBER_MONTHLY_TEXTS, THURSDAY);
    await spend(db, em.id, MEMBER_MONTHLY_TEXTS - 1, THURSDAY);

    await expect(textMagicLink(db, sender, jonah, grandma.id, APP, THURSDAY)).rejects.toThrow(
      `Grandma has already sent ${MEMBER_MONTHLY_TEXTS} texts this month`,
    );
    await textMagicLink(db, sender, jonah, em.id, APP, THURSDAY);
    await expect(textMagicLink(db, sender, jonah, em.id, APP, THURSDAY)).rejects.toThrow("Cousin Em has already sent");
    // The signed-out form answers as it would for a stranger's number.
    expect(await textOwnLink(db, sender, grandma.phone!, APP, THURSDAY)).toBe("check_your_texts");
    expect(sender.sent.map((s) => s.memberId)).toEqual([em.id]);
  });

  test("counts the calendar month only, delivered texts only, and a long text as its parts", async () => {
    const { db, jonah } = await setup();
    const sender = recorder();
    const lastMonth = new Date("2026-08-31T23:59:00Z");
    await spend(db, jonah.id, 40, lastMonth);
    await spend(db, jonah.id, 5, THURSDAY, { status: "failed" });
    await spend(db, jonah.id, 5, THURSDAY, { provider: "noop" });
    await spend(db, jonah.id, 2, THURSDAY);

    expect((await textBudget(db, sender, THURSDAY)).used).toBe(2);
    expect(monthStart(THURSDAY)).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(segmentsOf("a".repeat(160))).toBe(1);
    expect(segmentsOf("a".repeat(161))).toBe(2);
    expect(segmentsOf("a".repeat(307))).toBe(3);
  });

  test("the month can restart on the day Pingram's billing cycle does", async () => {
    const { db, jonah } = await setup();
    // THURSDAY is 2026-09-10: a cycle that restarts on the 4th began on 2026-09-04.
    await spend(db, jonah.id, 7, new Date("2026-09-03T12:00:00Z"));
    await spend(db, jonah.id, 2, new Date("2026-09-05T12:00:00Z"));

    expect((await textBudget(db, recorder(), THURSDAY, { TEXT_MONTH_STARTS_ON: "4" })).used).toBe(2);
    expect((await textBudget(db, recorder(), THURSDAY, {})).used).toBe(9);
    expect(monthStart(THURSDAY, 4)).toEqual(new Date("2026-09-04T00:00:00Z"));
    expect(monthStart(new Date("2026-10-02T12:00:00Z"), 4)).toEqual(new Date("2026-09-04T00:00:00Z"));
    expect(monthStart(new Date("2026-01-02T12:00:00Z"), 4)).toEqual(new Date("2025-12-04T00:00:00Z"));
    expect([monthStartDay({}), monthStartDay({ TEXT_MONTH_STARTS_ON: "31" }), monthStartDay({ TEXT_MONTH_STARTS_ON: "4" })]).toEqual([1, 1, 4]);
  });

  test("an extended character takes two places, and one outside GSM-7 sends the text as UCS-2", () => {
    expect(segmentsOf("€".repeat(80))).toBe(1);
    expect(segmentsOf("€".repeat(81))).toBe(2);
    expect(segmentsOf("a".repeat(69) + "’")).toBe(1);
    expect(segmentsOf("a".repeat(70) + "’")).toBe(2);
    expect(segmentsOf("🏈" + "a".repeat(69))).toBe(2);
  });

  test("the no-op sender has no budget and its rows spend none", async () => {
    const { db, jonah, grandma, em } = await setup();
    await spend(db, jonah.id, 500, THURSDAY);

    await textMagicLink(db, noopSender, jonah, grandma.id, APP, THURSDAY);
    await textMagicLink(db, noopSender, jonah, em.id, APP, THURSDAY);

    expect((await recentTexts(db, jonah))[0]).toMatchObject({ provider: "noop", ok: true });
    expect((await textBudget(db, recorder(), THURSDAY)).remaining).toBe(0);
  });
});

describe("the Pick reminder by push", () => {
  test("pushes each member on Push who is behind, once, and nobody who is done or deactivated, and texts nobody", async () => {
    const { db, jonah, week } = await setup();
    await channel(db, jonah.id, "push");
    await device(db, jonah.id, "https://push.example/jonah");
    const push = pusher();

    const result = await remindEveryone(db, by(push), jonah, week.id, THURSDAY);

    expect(result.pushed.map((p) => [p.member.displayName, p.ok])).toEqual([
      ["Grandma", true],
      ["Cousin Em", true],
    ]);
    expect(result.skipped).toEqual([]);
    expect(push.sent.map((s) => s.endpoint)).toEqual(["https://push.example/grandma", "https://push.example/em"]);
    expect(await db.select().from(textMessages)).toEqual([]);
    expect(reminderSummary(result)).toBe("Pushed Grandma, Cousin Em.");
  });

  test("a member on Push gets it on every device, opted out of texts or not, opening the Picks step still owed", async () => {
    const { db, jonah, grandma, em, week } = await setup();
    await device(db, em.id, "https://push.example/em-tablet");
    await setSmsOptedOut(db, jonah, grandma.id, true);
    await setPhone(db, jonah, em.id, "");
    const push = pusher();

    const result = await remindEveryone(db, by(push), jonah, week.id, THURSDAY);

    expect(result.pushed.map((p) => [p.member.displayName, p.ok])).toEqual([
      ["Grandma", true],
      ["Cousin Em", true],
    ]);
    expect(push.sent.filter((s) => s.endpoint.includes("em")).map((s) => s.endpoint).sort()).toEqual([
      "https://push.example/em",
      "https://push.example/em-tablet",
    ]);
    expect(push.sent.find((s) => s.endpoint === "https://push.example/em")!.payload).toEqual({
      title: "Week 2 picks lock Thu 7 PM CT",
      body: "Still need 3 picks, Lock, Tiebreaker.",
      url: "/picks",
      tag: "reminder-week-2",
    });
  });

  test("when every device is gone, the subscriptions are deleted and the reminder turns off", async () => {
    const { db, jonah, em, week } = await setup();
    await device(db, em.id, "https://push.example/em-old-phone");
    const push = pusher({ "https://push.example/em": "gone", "https://push.example/em-old-phone": "gone" });

    const result = await remindEveryone(db, by(push), jonah, week.id, THURSDAY);

    expect(result.pushed.map((p) => [p.member.displayName, p.ok, p.stopped])).toEqual([
      ["Grandma", true, false],
      ["Cousin Em", false, true],
    ]);
    expect((await db.select().from(pushSubscriptions)).map((d) => d.endpoint)).toEqual(["https://push.example/grandma"]);
    const [after] = await db.select().from(members).where(eq(members.id, em.id));
    expect(after).toMatchObject({ reminderChannel: "off", pushStoppedAt: THURSDAY });
    expect(reminderSummary(result)).toBe(
      "Pushed Grandma. Failed: Cousin Em (push stopped reaching their phone, so their reminder turned off).",
    );
  });

  test("one gone device among working ones is dropped and the reminder stays on; a service that fails keeps its row", async () => {
    const { db, jonah, grandma, em, week } = await setup();
    await channel(db, grandma.id, "off");
    await device(db, em.id, "https://push.example/old");
    await device(db, em.id, "https://push.example/flaky");
    const push = pusher({ "https://push.example/old": "gone", "https://push.example/flaky": "failed" });

    const result = await remindEveryone(db, by(push), jonah, week.id, THURSDAY);

    expect(result.pushed.map((p) => [p.ok, p.stopped])).toEqual([[true, false]]);
    expect((await db.select().from(pushSubscriptions)).map((d) => d.endpoint).sort()).toEqual([
      "https://push.example/em",
      "https://push.example/flaky",
      "https://push.example/grandma",
    ]);
    const [after] = await db.select().from(members).where(eq(members.id, em.id));
    expect(after.reminderChannel).toBe("push");
    expect(await db.select().from(pushMessages)).toMatchObject([{ memberId: em.id, kind: "reminder", sent: 1, gone: 1, failed: 1 }]);
  });

  test("Off is skipped and named, and with no push on the server a member on Push is named, not silently dropped", async () => {
    const { db, jonah, grandma, week } = await setup();
    await channel(db, grandma.id, "off");

    const off = await remindEveryone(db, by(pusher()), jonah, week.id, THURSDAY);
    expect(off.skipped.map((s) => [s.row.member.displayName, s.why])).toEqual([["Grandma", "reminder_off"]]);
    expect(off.pushed.map((p) => p.member.displayName)).toEqual(["Cousin Em"]);

    const unset = await remindEveryone(db, by(null), jonah, week.id, THURSDAY);
    expect(unset.pushed).toEqual([]);
    expect(unset.skipped.map((s) => [s.row.member.displayName, s.why])).toEqual([
      ["Grandma", "reminder_off"],
      ["Cousin Em", "push_not_set_up"],
    ]);
    expect(reminderSummary(unset)).toBe(
      "Nobody was reminded. Not reminded: Grandma (reminder is off), Cousin Em (push is not set up on this server).",
    );
  });

  test("a channel left on Text by a hand edit counts as Off", async () => {
    const { db, jonah, grandma, week } = await setup();
    await db.execute(sql`update ${members} set reminder_channel = 'text' where id = ${grandma.id}`);

    const result = await remindEveryone(db, by(pusher()), jonah, week.id, THURSDAY);

    expect(result.skipped.map((s) => [s.row.member.displayName, s.why])).toEqual([["Grandma", "reminder_off"]]);
    expect(await db.select().from(textMessages)).toEqual([]);
  });

  test("the plan the console reads names the same people the button reaches", async () => {
    const { db, grandma, em, week } = await setup();
    await channel(db, grandma.id, "off");
    const report = await pickReport(db, week.id, THURSDAY);

    const plan = planReminders(report);
    expect(plan.push.map((r) => r.member.displayName)).toEqual(["Cousin Em"]);
    expect(plan.skip.map((s) => s.why)).toEqual(["reminder_off"]);
    expect(planReminders(report, new Set([em.id])).push).toEqual([]);
    expect(planReminders(report, undefined, { push: false }).skip.map((s) => s.why)).toEqual(["reminder_off", "push_not_set_up"]);
  });

  test("a push tap opens the first Picks step still owed", () => {
    const report = { week: { weekNumber: 8 }, deadline: new Date("2026-10-17T16:00:00Z") } as Parameters<typeof reminderPush>[0];
    const owing = (picksMade: number, lockOpen: boolean) =>
      ({ progress: { countingGames: 5, picksMade, lockOpen, guessSet: false } }) as Parameters<typeof reminderPush>[1];

    expect(reminderPush(report, owing(3, true))).toMatchObject({
      title: "Week 8 picks lock Sat 11 AM CT",
      body: "Still need 2 picks, Lock, Tiebreaker.",
      url: "/picks",
    });
    expect(reminderPush(report, owing(5, true))).toMatchObject({ body: "Still need Lock, Tiebreaker.", url: "/picks?step=lock" });
    expect(reminderPush(report, owing(5, false))).toMatchObject({ body: "Still need Tiebreaker.", url: "/picks?step=guess" });
  });
});

describe("texting a Magic Link", () => {
  test("sends the member's own link with the opt-out and logs it", async () => {
    const { db, jonah, grandma } = await setup();
    const sender = recorder();

    await textMagicLink(db, sender, jonah, grandma.id, APP, THURSDAY);

    expect(sender.sent).toEqual([
      {
        to: toE164(grandma.phone!),
        body: `Hi Grandma, your Saturday Slate sign-in link: ${APP}/m/${grandma.token} ${OPT_OUT_LINE}`,
        memberId: grandma.id,
      },
    ]);
    expect(await recentTexts(db, jonah)).toMatchObject([{ memberName: "Grandma", kind: "magic_link", ok: true }]);
  });

  test("refuses in a sentence when the app cannot text them, and when the send fails", async () => {
    const { db, jonah, grandma, em, gone } = await setup();
    const sender = recorder([toE164(em.phone!)!]);
    await setSmsOptedOut(db, jonah, grandma.id, true);
    await setPhone(db, jonah, jonah.id, "");

    await expect(textMagicLink(db, sender, jonah, grandma.id, APP, THURSDAY)).rejects.toThrow("Grandma was not texted: opted out.");
    await expect(textMagicLink(db, sender, jonah, jonah.id, APP, THURSDAY)).rejects.toThrow("Jonah was not texted: no phone number.");
    await expect(textMagicLink(db, sender, jonah, gone.id, APP, THURSDAY)).rejects.toThrow("deactivated");
    await expect(textMagicLink(db, sender, jonah, em.id, APP, THURSDAY)).rejects.toThrow("The text to Cousin Em failed: carrier rejected");
    await expect(textMagicLink(db, sender, jonah, 999999, APP, THURSDAY)).rejects.toThrow(/no such member/i);
    // The failed try is on the record; the refusals never reached the provider.
    expect(await recentTexts(db, jonah)).toMatchObject([{ memberName: "Cousin Em", ok: false }]);
  });

  test("refuses rather than overspend, so the link can go by hand", async () => {
    const { db, jonah, grandma } = await setup();
    await spend(db, jonah.id, FREE_TIER_BUDGET, THURSDAY);
    await expect(textMagicLink(db, recorder(), jonah, grandma.id, APP, THURSDAY)).rejects.toThrow("send it by hand");
  });
});

describe("the scheduled reminder", () => {
  const HOUR = 3600_000;

  test("pushes whoever is behind once the Deadline is within a day, and not before or after", async () => {
    const { db, deadline } = await setup();
    const push = pusher();

    const early = await runScheduledReminder(db, by(push), new Date(deadline.getTime() - 25 * HOUR));
    expect(early).toEqual({ ran: false, why: "deadline is more than a day away" });
    const late = await runScheduledReminder(db, by(push), new Date(deadline.getTime() + HOUR));
    expect(late).toEqual({ ran: false, why: "deadline has passed" });
    expect(push.sent).toEqual([]);

    const run = await runScheduledReminder(db, by(push), new Date(deadline.getTime() - 23 * HOUR));
    expect(run.ran && run.pushed.map((p) => p.member.displayName)).toEqual(["Grandma", "Cousin Em"]);
    expect(push.sent).toHaveLength(2);
    expect(await db.select().from(textMessages)).toEqual([]);
  });

  test("a second run in the window pushes nobody again, but someone no device took is tried again", async () => {
    const { db, deadline } = await setup();
    const now = new Date(deadline.getTime() - 20 * HOUR);
    const push = pusher({ "https://push.example/grandma": "failed" });

    await runScheduledReminder(db, by(push), now);
    expect(push.sent.map((s) => s.endpoint)).toEqual(["https://push.example/em"]);

    const healthy = pusher();
    const again = await runScheduledReminder(db, by(healthy), new Date(now.getTime() + HOUR));
    expect(again.ran && again.pushed.map((p) => p.member.displayName)).toEqual(["Grandma"]);
    expect(healthy.sent.map((s) => s.endpoint)).toEqual(["https://push.example/grandma"]);
  });

  test("a text sent before push-only does not stand in for this Week's push", async () => {
    const { db, grandma, week, deadline } = await setup();
    await spend(db, grandma.id, 1, THURSDAY, { kind: "scheduled_reminder", weekId: week.id });

    const run = await runScheduledReminder(db, by(pusher()), new Date(deadline.getTime() - HOUR));

    expect(run.ran && run.pushed.map((p) => p.member.displayName)).toEqual(["Grandma", "Cousin Em"]);
  });

  test("a manual reminder does not use up the scheduled one", async () => {
    const { db, jonah, week, deadline } = await setup();
    const push = pusher();
    await remindEveryone(db, by(push), jonah, week.id, THURSDAY);
    const run = await runScheduledReminder(db, by(push), new Date(deadline.getTime() - HOUR));
    expect(run.ran && run.pushed).toHaveLength(2);
  });

  test("does nothing before a Week is published, and pushes nobody who is done", async () => {
    const { db, jonah, grandma, em, deadline, slate, michigan, texas, miami } = await setup();
    for (const member of [grandma, em]) {
      for (const game of [michigan, texas, miami]) await pickAs(db, member, slate, game, game.homeTeamId, THURSDAY);
      await lockAs(db, member, slate, texas.id, THURSDAY);
      await guessAs(db, member, slate, 60, THURSDAY);
    }
    const push = pusher();
    const run = await runScheduledReminder(db, by(push), new Date(deadline.getTime() - HOUR));
    expect(run).toMatchObject({ ran: true, pushed: [], skipped: [] });
    expect(push.sent).toEqual([]);
    expect(jonah.isCommissioner).toBe(true);
  });
});

describe("deleting a member", () => {
  test("takes their text log with them", async () => {
    const { db, jonah, em } = await setup();
    await textMagicLink(db, recorder(), jonah, em.id, APP, THURSDAY);
    await setMemberActive(db, jonah, em.id, false);

    await removeMember(db, jonah, em.id);

    expect(await db.select().from(textMessages).where(eq(textMessages.memberId, em.id))).toEqual([]);
    expect(await db.query.members.findFirst({ where: eq(members.id, em.id) })).toBeUndefined();
  });
});

describe("text me my link", () => {
  test("texts the number on file its current link, however it is typed, and says only to check texts", async () => {
    const { db, grandma } = await setup();
    const sender = recorder();

    expect(await textOwnLink(db, sender, "(256) 555-0002", APP, THURSDAY)).toBe("check_your_texts");

    expect(sender.sent).toEqual([
      {
        to: "+12565550002",
        body: `Hi Grandma, your Saturday Slate sign-in link: ${APP}/m/${grandma.token} ${OPT_OUT_LINE}`,
        memberId: grandma.id,
      },
    ]);
  });

  test("an unknown number sends nothing and answers the same as a known one", async () => {
    const { db } = await setup();
    const sender = recorder();
    for (const phone of ["(256) 555-9999", "not a number", "555-0123"]) {
      expect(await textOwnLink(db, sender, phone, APP, THURSDAY)).toBe("check_your_texts");
    }
    expect(sender.sent).toEqual([]);
  });

  test("texts nobody who is deactivated or opted out, and never the same person twice in a few minutes", async () => {
    const { db, jonah, grandma, em, gone } = await setup();
    const sender = recorder();
    await setSmsOptedOut(db, jonah, grandma.id, true);

    await textOwnLink(db, sender, grandma.phone!, APP, THURSDAY);
    await textOwnLink(db, sender, gone.phone!, APP, THURSDAY);
    expect(sender.sent).toEqual([]);

    await textOwnLink(db, sender, em.phone!, APP, THURSDAY);
    await textOwnLink(db, sender, em.phone!, APP, new Date(THURSDAY.getTime() + 60_000));
    expect(sender.sent).toHaveLength(1);
    // The row is stamped by the database clock, not `now`, so the wait is checked against the log's own time.
    await textOwnLink(db, sender, em.phone!, APP, new Date(Date.now() + OWN_LINK_COOLDOWN_MS + 1000));
    expect(sender.sent).toHaveLength(2);
  });

  test("says the budget is spent, for every number alike, and sends nothing", async () => {
    const { db, jonah, grandma } = await setup();
    const sender = recorder();
    await spend(db, jonah.id, FREE_TIER_BUDGET, THURSDAY);

    expect(await textOwnLink(db, sender, grandma.phone!, APP, THURSDAY)).toBe("budget_spent");
    expect(await textOwnLink(db, sender, "(256) 555-9999", APP, THURSDAY)).toBe("budget_spent");
    expect(sender.sent).toEqual([]);
  });
});
