/**
 * Every text the app sends: what it says, who may get it, what it costs
 * against the month's budget, and the log that records each try.
 *
 * A send is planned before it is made. `planReminders` decides who is reached
 * and who is not, and why, from plain rows and a remaining budget; the console
 * reads the same plan to show the people the app cannot text, so what the page
 * promises and what the button does cannot drift apart. Delivery then walks the
 * plan and writes one `text_messages` row per try.
 *
 * Vocabulary follows CONTEXT.md. Every writer takes the database first and the
 * `SmsSender` second; `now` is the server clock, injected so tests can sit on
 * either side of the Deadline and either side of a month's end.
 */
import "server-only";
import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { members, textMessages, type Member, type TextKind } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { InvalidMember, magicLinkFor } from "@/lib/members/members";
import { deadlineInCentral, owed, pickReport, type MemberProgress, type PickReport } from "@/lib/picks/console";
import { Refusal } from "@/lib/refusal";
import { publishedSlate } from "@/lib/slate/slate";
import { toE164 } from "./phone";
import { NOOP, type SmsSender } from "./sender";

/** Every text ends with this. The provider honors the reply itself; the app only learns of it from a commissioner. */
export const OPT_OUT_LINE = "Reply STOP to opt out.";

/**
 * Pingram's free tier is 100 US SMS a month. The app stops five short of it, so
 * a text that segments differently than we count, or a send made by hand from
 * the dashboard, does not tip the account over.
 */
export const MONTHLY_BUDGET = 95;

/** How far ahead of the Deadline the scheduled reminder looks. The cron runs once a day. */
export const REMINDER_WINDOW_MS = 24 * 3600_000;

export class TextRefused extends Refusal {}

/** Why the app did not text someone. */
export type Unreached = "deactivated" | "opted_out" | "no_phone" | "bad_phone" | "over_budget";

export const UNREACHED: Record<Unreached, string> = {
  deactivated: "deactivated",
  opted_out: "opted out",
  no_phone: "no phone number",
  bad_phone: "phone number is not one we can text",
  over_budget: "month's text budget is used up",
};

/** Billed messages in a body: one up to 160 characters, then 153 to a part. */
export function segmentsOf(body: string): number {
  return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
}

const withOptOut = (body: string) => `${body} ${OPT_OUT_LINE}`;

export function magicLinkBody(member: Member, appUrl: string): string {
  return withOptOut(`Hi ${member.displayName}, your Saturday Slate sign-in link: ${magicLinkFor(member, appUrl)}`);
}

export function reminderBody(report: PickReport, row: MemberProgress, appUrl: string): string {
  const link = appUrl.replace(/\/+$/, "");
  return withOptOut(
    `Saturday Slate Week ${report.week.weekNumber} picks lock ${deadlineInCentral(report.deadline)}. ` +
      `You still need ${owed(row).join(", ")}. ${link}`,
  );
}

/** The number to text and why not, in the order a commissioner would fix them. */
function reach(member: Member): { to: string } | { why: Unreached } {
  if (!member.active) return { why: "deactivated" };
  if (member.smsOptedOut) return { why: "opted_out" };
  if (!member.phone) return { why: "no_phone" };
  const to = toE164(member.phone);
  return to ? { to } : { why: "bad_phone" };
}

/** The first instant of `now`'s calendar month, in UTC: the month Pingram bills. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface TextBudget {
  used: number;
  budget: number;
  remaining: number;
}

/** What this month's delivered texts have spent. A failed try and a no-op row spend nothing. */
export async function textBudget(db: Db, sender: SmsSender, now: Date): Promise<TextBudget> {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${textMessages.segments}), 0)::int` })
    .from(textMessages)
    .where(and(eq(textMessages.status, "sent"), ne(textMessages.provider, NOOP), gte(textMessages.createdAt, monthStart(now))));
  const used = row.used;
  // Nothing delivered, so nothing to run out of.
  const budget = sender.name === NOOP ? Number.POSITIVE_INFINITY : MONTHLY_BUDGET;
  return { used, budget, remaining: Math.max(0, budget - used) };
}

export interface PlannedText {
  member: Member;
  to: string;
  body: string;
  segments: number;
}

export interface ReminderPlan {
  send: (PlannedText & { row: MemberProgress })[];
  skip: { row: MemberProgress; why: Unreached }[];
}

/**
 * Who is texted, in the order the members joined, until the budget runs out;
 * everyone else who is behind is listed with the reason. A member who is
 * complete is in neither list. `already` are members not to text again.
 */
export function planReminders(
  report: PickReport,
  appUrl: string,
  remaining: number,
  already: ReadonlySet<number> = new Set(),
): ReminderPlan {
  const plan: ReminderPlan = { send: [], skip: [] };
  let left = remaining;
  for (const row of report.members) {
    if (row.complete || already.has(row.member.id)) continue;
    const target = reach(row.member);
    if ("why" in target) {
      plan.skip.push({ row, why: target.why });
      continue;
    }
    const body = reminderBody(report, row, appUrl);
    const segments = segmentsOf(body);
    if (segments > left) {
      plan.skip.push({ row, why: "over_budget" });
      continue;
    }
    left -= segments;
    plan.send.push({ row, member: row.member, to: target.to, body, segments });
  }
  return plan;
}

export interface TextOutcome {
  member: Member;
  ok: boolean;
  detail: string;
}

/** Sends one planned text and logs the try. */
async function deliver(
  db: Db,
  sender: SmsSender,
  kind: TextKind,
  weekId: number | null,
  text: PlannedText,
): Promise<TextOutcome> {
  const result = await sender.send(text.to, text.body);
  await db.insert(textMessages).values({
    memberId: text.member.id,
    kind,
    weekId,
    phone: text.to,
    provider: sender.name,
    status: result.ok ? "sent" : "failed",
    detail: result.detail,
    segments: text.segments,
  });
  return { member: text.member, ok: result.ok, detail: result.detail };
}

/** Texts one member their Magic Link; refuses in a sentence when the app cannot. */
export async function textMagicLink(
  db: Db,
  sender: SmsSender,
  actor: Commissioner,
  memberId: number,
  appUrl: string,
  now: Date = new Date(),
): Promise<TextOutcome> {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new InvalidMember("No such member.");
  const target = reach(member);
  if ("why" in target) throw new TextRefused(`${member.displayName} was not texted: ${UNREACHED[target.why]}.`);
  const body = magicLinkBody(member, appUrl);
  const segments = segmentsOf(body);
  if (segments > (await textBudget(db, sender, now)).remaining) {
    throw new TextRefused(`${UNREACHED.over_budget}; copy ${member.displayName}'s link and send it by hand.`);
  }
  const outcome = await deliver(db, sender, "magic_link", null, { member, to: target.to, body, segments });
  if (!outcome.ok) throw new TextRefused(`The text to ${member.displayName} failed: ${outcome.detail}`);
  return outcome;
}

/** How long after texting someone their link the signed-out form will not text it again. */
export const OWN_LINK_COOLDOWN_MS = 5 * 60_000;

export type OwnLink = "check_your_texts" | "budget_spent";

/**
 * "Text me my link", from a signed-out form: whoever holds the number asked for
 * it, so the text goes to the number on file and only there, with the member's
 * current Magic Link (not regenerated). The answer never says whether the number
 * belongs to anyone, so the form cannot be used to find out who plays. The one
 * thing it does say is that the month's budget is spent, and that is true of every
 * number alike. A member who was just texted is not texted again for a few
 * minutes, so pressing the button in a loop cannot drain the budget through one
 * number.
 */
export async function textOwnLink(
  db: Db,
  sender: SmsSender,
  rawPhone: string,
  appUrl: string,
  now: Date = new Date(),
): Promise<OwnLink> {
  const asked = toE164(rawPhone);
  if (!asked) return "check_your_texts";
  if ((await textBudget(db, sender, now)).remaining === 0) return "budget_spent";
  const holders = await db.query.members.findMany({ where: isNotNull(members.phone) });
  const member = holders.find((m) => m.phone !== null && toE164(m.phone) === asked);
  if (!member || !member.active || member.smsOptedOut) return "check_your_texts";
  const [recent] = await db
    .select({ id: textMessages.id })
    .from(textMessages)
    .where(
      and(
        eq(textMessages.memberId, member.id),
        eq(textMessages.kind, "magic_link"),
        gte(textMessages.createdAt, new Date(now.getTime() - OWN_LINK_COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent) return "check_your_texts";
  const body = magicLinkBody(member, appUrl);
  const segments = segmentsOf(body);
  if (segments > (await textBudget(db, sender, now)).remaining) return "budget_spent";
  await deliver(db, sender, "magic_link", null, { member, to: asked, body, segments });
  return "check_your_texts";
}

export interface ReminderResult {
  texted: TextOutcome[];
  skipped: ReminderPlan["skip"];
}

/** Texts everyone behind on a Week who can be reached, and reports who could not be. */
export async function remindEveryone(
  db: Db,
  sender: SmsSender,
  actor: Commissioner,
  weekId: number,
  appUrl: string,
  now: Date = new Date(),
): Promise<ReminderResult> {
  return sendReminders(db, sender, "reminder", await pickReport(db, weekId, now), appUrl, now);
}

async function sendReminders(
  db: Db,
  sender: SmsSender,
  kind: TextKind,
  report: PickReport,
  appUrl: string,
  now: Date,
  already?: ReadonlySet<number>,
): Promise<ReminderResult> {
  const { remaining } = await textBudget(db, sender, now);
  const plan = planReminders(report, appUrl, remaining, already);
  const texted: TextOutcome[] = [];
  // One at a time: a shared sender number is rate limited, and the order stays the roster's.
  for (const text of plan.send) texted.push(await deliver(db, sender, kind, report.week.id, text));
  return { texted, skipped: plan.skip };
}

export type ScheduledRun =
  | { ran: false; why: string }
  | ({ ran: true; weekNumber: number } & ReminderResult);

/**
 * The daily cron's work: when the latest published Week's Deadline is within
 * the next day, text whoever is still behind. Cron is best effort and can fire
 * twice, so a member already sent this Week's scheduled reminder is not sent it
 * again; the once-a-day schedule makes sure each Deadline falls in exactly one
 * window.
 */
export async function runScheduledReminder(
  db: Db,
  sender: SmsSender,
  appUrl: string,
  now: Date = new Date(),
): Promise<ScheduledRun> {
  const slate = await publishedSlate(db);
  if (!slate?.week.deadline) return { ran: false, why: "no published week" };
  const { deadline } = slate.week;
  if (deadline <= now) return { ran: false, why: "deadline has passed" };
  if (deadline.getTime() - now.getTime() > REMINDER_WINDOW_MS) return { ran: false, why: "deadline is more than a day away" };
  const earlier = await db
    .select({ memberId: textMessages.memberId })
    .from(textMessages)
    .where(
      and(eq(textMessages.weekId, slate.week.id), eq(textMessages.kind, "scheduled_reminder"), eq(textMessages.status, "sent")),
    );
  const report = await pickReport(db, slate.week.id, now);
  const result = await sendReminders(
    db,
    sender,
    "scheduled_reminder",
    report,
    appUrl,
    now,
    new Set(earlier.map((r) => r.memberId)),
  );
  return { ran: true, weekNumber: slate.week.weekNumber, ...result };
}

export interface RecentText {
  id: number;
  memberName: string;
  kind: TextKind;
  provider: string;
  ok: boolean;
  detail: string | null;
  createdAt: Date;
}

/** The newest tries first, for the console: failures are read here. */
export async function recentTexts(db: Db, actor: Commissioner, limit = 20): Promise<RecentText[]> {
  const rows = await db
    .select({
      id: textMessages.id,
      memberName: members.displayName,
      kind: textMessages.kind,
      provider: textMessages.provider,
      status: textMessages.status,
      detail: textMessages.detail,
      createdAt: textMessages.createdAt,
    })
    .from(textMessages)
    .innerJoin(members, eq(members.id, textMessages.memberId))
    .orderBy(desc(textMessages.createdAt), desc(textMessages.id))
    .limit(limit);
  return rows.map(({ status, ...row }) => ({ ...row, ok: status === "sent" }));
}

/** The sentence a bulk send answers with. */
export function reminderSummary(result: ReminderResult): string {
  const sent = result.texted.filter((t) => t.ok);
  const failed = result.texted.filter((t) => !t.ok);
  const parts = [sent.length === 0 ? "Nobody was texted." : `Texted ${sent.map((t) => t.member.displayName).join(", ")}.`];
  if (failed.length) parts.push(`Failed: ${failed.map((t) => `${t.member.displayName} (${t.detail})`).join("; ")}.`);
  if (result.skipped.length) {
    parts.push(`Not texted: ${result.skipped.map((s) => `${s.row.member.displayName} (${UNREACHED[s.why]})`).join(", ")}.`);
  }
  return parts.join(" ");
}
