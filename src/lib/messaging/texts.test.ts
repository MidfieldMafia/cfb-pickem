/**
 * Who is texted and when, over the no-op and a recording sender: the reminder's
 * audience, the month's budget, the opt-out, the log, and the scheduled run's
 * window. Nothing here reaches a provider.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { members, textMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { setMemberActive, setPhone, setSmsOptedOut, removeMember } from "@/lib/members/members";
import { pickReport } from "@/lib/picks/console";
import { guessAs, joinAt, lockAs, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { toE164 } from "./phone";
import { noopSender, type SmsSender } from "./sender";
import {
  MONTHLY_BUDGET,
  monthStart,
  OPT_OUT_LINE,
  planReminders,
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

/** A sender that records what it was asked to send; `failFor` numbers get a provider error. */
function recorder(failFor: string[] = []): SmsSender & { sent: { to: string; body: string }[] } {
  const sent: { to: string; body: string }[] = [];
  return {
    name: "pingram",
    sent,
    async send(to, body) {
      if (failFor.includes(to)) return { ok: false, detail: "carrier rejected" };
      sent.push({ to, body });
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

describe("reminding everyone who hasn't picked", () => {
  test("texts each member who is behind, once, and nobody who is done or deactivated", async () => {
    const { db, jonah, week, em } = await setup();
    const sender = recorder();

    const result = await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);

    expect(result.texted.map((t) => t.member.displayName)).toEqual(["Grandma", "Cousin Em"]);
    expect(result.skipped).toEqual([]);
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1].to).toBe(em.phone!.replace(/^\+?/, "+"));
    // Thu 2026-09-11 00:00Z is 7:00 PM Central on the 10th. The plain app link, no shortener, and the opt-out.
    expect(sender.sent[1].body).toBe(
      `Saturday Slate Week 2 picks lock Thu, Sep 10 at 7:00 PM Central. You still need 3 picks, Lock of the Week, Tiebreaker Guess. ${APP} ${OPT_OUT_LINE}`,
    );
    expect(sender.sent[0].body).toContain("You still need 2 picks, Lock of the Week, Tiebreaker Guess.");
  });

  test("skips the opted out, the numberless, and the number that will not convert, and says why", async () => {
    const { db, jonah, grandma, em, week } = await setup();
    const sender = recorder();
    await setSmsOptedOut(db, jonah, grandma.id, true);
    await setPhone(db, jonah, em.id, "555-0123");

    const result = await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);

    expect(sender.sent).toEqual([]);
    expect(result.skipped.map((s) => [s.row.member.displayName, s.why])).toEqual([
      ["Grandma", "opted_out"],
      ["Cousin Em", "bad_phone"],
    ]);
    expect(reminderSummary(result)).toBe(
      "Nobody was texted. Not texted: Grandma (opted out), Cousin Em (phone number is not one we can text).",
    );

    await setPhone(db, jonah, em.id, "");
    const again = await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);
    expect(again.skipped.map((s) => s.why)).toEqual(["opted_out", "no_phone"]);
  });

  test("logs every try with its recipient, kind and provider answer, and a failure shows in the console", async () => {
    const { db, jonah, grandma, em, week } = await setup();
    const sender = recorder([toE164(grandma.phone!)!]);

    const result = await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);

    expect(result.texted.map((t) => [t.member.displayName, t.ok])).toEqual([
      ["Grandma", false],
      ["Cousin Em", true],
    ]);
    expect(reminderSummary(result)).toBe("Texted Cousin Em. Failed: Grandma (carrier rejected).");
    const log = await recentTexts(db, jonah);
    expect(log.map((l) => [l.memberName, l.kind, l.provider, l.ok, l.detail])).toEqual([
      ["Cousin Em", "reminder", "pingram", true, "track-1"],
      ["Grandma", "reminder", "pingram", false, "carrier rejected"],
    ]);
    const [row] = await db.select().from(textMessages).where(eq(textMessages.memberId, em.id));
    expect(row).toMatchObject({ weekId: week.id, phone: toE164(em.phone!), segments: 2 });
  });
});

describe("the monthly budget", () => {
  test("stops before the cap and names who was left for the commissioner to text by hand", async () => {
    const { db, jonah, grandma, week } = await setup();
    const sender = recorder();
    // A reminder that names all three things owed runs past 160 characters: two billed parts each.
    await spend(db, jonah.id, MONTHLY_BUDGET - 3, THURSDAY);

    const before = await textBudget(db, sender, THURSDAY);
    expect(before).toEqual({ used: MONTHLY_BUDGET - 3, budget: MONTHLY_BUDGET, remaining: 3 });

    const result = await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);

    expect(result.texted.map((t) => t.member.displayName)).toEqual(["Grandma"]);
    expect(result.skipped.map((s) => [s.row.member.displayName, s.why])).toEqual([["Cousin Em", "over_budget"]]);
    expect(sender.sent.map((s) => s.to)).toEqual([toE164(grandma.phone!)]);
    expect((await textBudget(db, sender, THURSDAY)).remaining).toBe(1);

    // One part is not enough for either reminder, so the plan the console reads names everyone.
    const report = await pickReport(db, week.id, THURSDAY);
    const plan = planReminders(report, APP, 1);
    expect(plan.send).toEqual([]);
    expect(plan.skip.map((s) => s.why)).toEqual(["over_budget", "over_budget"]);
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

  test("the no-op sender has no budget and its rows spend none", async () => {
    const { db, jonah, week } = await setup();
    await spend(db, jonah.id, 500, THURSDAY);

    const result = await remindEveryone(db, noopSender, jonah, week.id, APP, THURSDAY);

    expect(result.texted).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    expect((await recentTexts(db, jonah))[0]).toMatchObject({ provider: "noop", ok: true });
    expect((await textBudget(db, recorder(), THURSDAY)).remaining).toBe(0);
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
    await spend(db, jonah.id, MONTHLY_BUDGET, THURSDAY);
    await expect(textMagicLink(db, recorder(), jonah, grandma.id, APP, THURSDAY)).rejects.toThrow("send it by hand");
  });
});

describe("the scheduled reminder", () => {
  const HOUR = 3600_000;

  test("texts whoever is behind once the Deadline is within a day, and not before or after", async () => {
    const { db, deadline } = await setup();
    const sender = recorder();

    const early = await runScheduledReminder(db, sender, APP, new Date(deadline.getTime() - 25 * HOUR));
    expect(early).toEqual({ ran: false, why: "deadline is more than a day away" });
    const late = await runScheduledReminder(db, sender, APP, new Date(deadline.getTime() + HOUR));
    expect(late).toEqual({ ran: false, why: "deadline has passed" });
    expect(sender.sent).toEqual([]);

    const run = await runScheduledReminder(db, sender, APP, new Date(deadline.getTime() - 23 * HOUR));
    expect(run.ran && run.texted.map((t) => t.member.displayName)).toEqual(["Grandma", "Cousin Em"]);
    expect(sender.sent).toHaveLength(2);
  });

  test("a second run in the window texts nobody again, but someone who failed is tried again", async () => {
    const { db, jonah, deadline, grandma } = await setup();
    const now = new Date(deadline.getTime() - 20 * HOUR);
    const sender = recorder([toE164(grandma.phone!)!]);

    await runScheduledReminder(db, sender, APP, now);
    expect(sender.sent).toHaveLength(1);

    const healthy = recorder();
    const again = await runScheduledReminder(db, healthy, APP, new Date(now.getTime() + HOUR));
    expect(again.ran && again.texted.map((t) => t.member.displayName)).toEqual(["Grandma"]);
    expect(await recentTexts(db, jonah)).toHaveLength(3);
  });

  test("a manual reminder does not use up the scheduled one", async () => {
    const { db, jonah, week, deadline } = await setup();
    const sender = recorder();
    await remindEveryone(db, sender, jonah, week.id, APP, THURSDAY);
    const run = await runScheduledReminder(db, sender, APP, new Date(deadline.getTime() - HOUR));
    expect(run.ran && run.texted).toHaveLength(2);
  });

  test("does nothing before a Week is published, and texts nobody who is done", async () => {
    const { db, jonah, grandma, em, deadline, slate, michigan, texas, miami } = await setup();
    for (const member of [grandma, em]) {
      for (const game of [michigan, texas, miami]) await pickAs(db, member, slate, game, game.homeTeamId, THURSDAY);
      await lockAs(db, member, slate, texas.id, THURSDAY);
      await guessAs(db, member, slate, 60, THURSDAY);
    }
    const sender = recorder();
    const run = await runScheduledReminder(db, sender, APP, new Date(deadline.getTime() - HOUR));
    expect(run).toMatchObject({ ran: true, texted: [], skipped: [] });
    expect(sender.sent).toEqual([]);
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
    await spend(db, jonah.id, MONTHLY_BUDGET, THURSDAY);

    expect(await textOwnLink(db, sender, grandma.phone!, APP, THURSDAY)).toBe("budget_spent");
    expect(await textOwnLink(db, sender, "(256) 555-9999", APP, THURSDAY)).toBe("budget_spent");
    expect(sender.sent).toEqual([]);
  });
});
