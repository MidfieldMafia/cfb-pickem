/**
 * Every text the app sends, and the Pick reminder however it goes: what it
 * says, who may get it, what a text costs against the month's budget, and the
 * logs that record each try.
 *
 * The Pick reminder goes by push or not at all (#475): a member with it on is
 * pushed on every device they subscribed, and a member with it off is skipped.
 * It is never texted. When every device answers that it is gone, the
 * subscriptions are deleted and the reminder turns itself off.
 *
 * A reminder is planned before it is sent. `planReminders` decides who is
 * reached and who is not, and why, from plain rows; the console reads the same
 * plan to show the people a press would not reach, so what the page promises and
 * what the button does cannot drift apart. Delivery then walks the plan and
 * writes one `push_messages` row per member pushed. A Magic Link text writes one
 * `text_messages` row per try.
 *
 * Vocabulary follows GLOSSARY.md. Every writer takes the database first and the
 * `SmsSender`, or for a reminder the `ReminderSenders`, second; `now` is the server clock, injected so tests can sit on
 * either side of the Deadline and either side of a month's end.
 */
import "server-only";
import { and, desc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import { members, pushMessages, pushSubscriptions, textMessages, type Member, type PushKind, type TextKind } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatterFor } from "@/lib/intl-time";
import type { Commissioner } from "@/lib/members/authority";
import { InvalidMember, magicLinkFor, memberByNumber } from "@/lib/members/members";
import { pickReport, type MemberProgress, type PickReport } from "@/lib/picks/console";
import { plural } from "@/lib/plural";
import { Refusal } from "@/lib/refusal";
import type { Pusher, PushPayload, SendOutcome } from "@/lib/push/sender";
import { publishedSlate } from "@/lib/slate/slate";
import { toE164 } from "./phone";
import { NOOP, type SmsSender } from "./sender";

/**
 * A member's text from the app, the Magic Link, ends with this
 * (docs/research/pingram-opt-out.md). Pingram honors
 * the reply itself and tells the app by webhook (`opt-outs.ts`).
 */
export const OPT_OUT_LINE = "Reply STOP to opt out.";

/**
 * Pingram's free tier is 100 US SMS a month. The app stops five short of it, so
 * a text that segments differently than we count, or a send made by hand from
 * the dashboard, does not tip the account over. A paid plan raises the cap
 * with `TEXT_MONTHLY_BUDGET`, and no code changes.
 */
export const FREE_TIER_BUDGET = 95;

/**
 * No member is sent more than this in a month, whatever the budget, so a
 * button pressed over and over cannot spend the month on one person.
 */
export const MEMBER_MONTHLY_TEXTS = 10;

type Env = Record<string, string | undefined>;

/** `TEXT_MONTHLY_BUDGET`, the billed messages a month may spend; the free tier's stop when unset. */
export function monthlyBudget(env: Env = process.env): number {
  const set = Number(env.TEXT_MONTHLY_BUDGET);
  return env.TEXT_MONTHLY_BUDGET && Number.isInteger(set) && set >= 0 ? set : FREE_TIER_BUDGET;
}

/** `TEXT_MONTH_STARTS_ON`, the day of the month Pingram's billing cycle restarts on (1–28); the 1st when unset. */
export function monthStartDay(env: Env = process.env): number {
  const set = Number(env.TEXT_MONTH_STARTS_ON);
  return Number.isInteger(set) && set >= 1 && set <= 28 ? set : 1;
}

/** How far ahead of the Deadline the scheduled reminder looks. The cron runs once a day. */
export const REMINDER_WINDOW_MS = 24 * 3600_000;

export class TextRefused extends Refusal {}

/** Why the app did not remind someone. */
export type Unreached = "deactivated" | "reminder_off" | "push_not_set_up";

export const UNREACHED: Record<Unreached, string> = {
  deactivated: "deactivated",
  reminder_off: "reminder is off",
  push_not_set_up: "push is not set up on this server",
};

/** Why the app would not text someone their Magic Link. */
type Untextable = "deactivated" | "opted_out" | "no_phone" | "bad_phone" | "member_cap" | "over_budget";

const UNTEXTABLE: Record<Untextable, string> = {
  deactivated: "deactivated",
  opted_out: "opted out",
  no_phone: "no phone number",
  bad_phone: "phone number is not one we can text",
  member_cap: `already sent ${MEMBER_MONTHLY_TEXTS} texts this month`,
  over_budget: "month's text budget is used up",
};

/** The GSM-7 alphabet a plain text is sent in, and the characters that take two of its slots. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

/**
 * Billed messages in a body. In GSM-7 that is one up to 160 characters, then
 * 153 to a part, with an extended character such as `€` taking two. One
 * character outside it, an emoji or a curly apostrophe in a name, sends the
 * whole text as UCS-2: one up to 70 code units, then 67 to a part.
 */
export function segmentsOf(body: string): number {
  let septets = 0;
  for (const char of body) {
    if (GSM_BASIC.includes(char)) septets += 1;
    else if (GSM_EXTENDED.includes(char)) septets += 2;
    else return body.length <= 70 ? 1 : Math.ceil(body.length / 67);
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

export function magicLinkBody(member: Member, appUrl: string): string {
  return `Hi ${member.displayName}, your Saturday Slate sign-in link: ${magicLinkFor(member, appUrl)} ${OPT_OUT_LINE}`;
}

/** "Sat 11 AM CT": a reminder goes out in its Deadline's own week, so the weekday is enough. */
export function deadlineBriefly(deadline: Date): string {
  const at = formatterFor({ weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return `${at.format(deadline).replace(":00", "")} CT`;
}

/** What one member still owes, as short as stays clear: "2 picks, Lock, Tiebreaker". */
function owedBriefly(row: Pick<MemberProgress, "progress">): string {
  const missing: string[] = [];
  const picksLeft = row.progress.countingGames - row.progress.picksMade;
  if (picksLeft > 0) missing.push(plural(picksLeft, "pick"));
  if (row.progress.lockOpen) missing.push("Lock");
  if (!row.progress.guessSet) missing.push("Tiebreaker");
  return missing.join(", ");
}

/** Where a push tap opens: the first Picks step still owed. */
function reminderPath(row: Pick<MemberProgress, "progress">): string {
  if (row.progress.countingGames > row.progress.picksMade) return "/picks";
  if (row.progress.lockOpen) return "/picks?step=lock";
  return "/picks?step=guess";
}

/** The Pick reminder as a push: the Deadline in the title, what is owed in the body. */
export function reminderPush(
  report: Pick<PickReport, "week" | "deadline">,
  row: Pick<MemberProgress, "progress">,
): PushPayload {
  return {
    title: `Week ${report.week.weekNumber} picks lock ${deadlineBriefly(report.deadline)}`,
    body: `Still need ${owedBriefly(row)}.`,
    url: reminderPath(row),
    tag: `reminder-week-${report.week.weekNumber}`,
  };
}

/** The number to text and why not, in the order a commissioner would fix them. */
function reach(member: Member): { to: string } | { why: Untextable } {
  if (!member.active) return { why: "deactivated" };
  if (member.smsOptedOut) return { why: "opted_out" };
  if (!member.phone) return { why: "no_phone" };
  const to = toE164(member.phone);
  return to ? { to } : { why: "bad_phone" };
}

/**
 * The first instant of the billing month `now` is in, in UTC: the month Pingram
 * bills, which restarts on `startDay` rather than always on the 1st.
 */
export function monthStart(now: Date, startDay = 1): Date {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), startDay));
  return thisMonth <= now ? thisMonth : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, startDay));
}

export interface TextBudget {
  used: number;
  budget: number;
  remaining: number;
  /** Billed messages each member has been sent this month; a member sent none is absent. */
  byMember: ReadonlyMap<number, number>;
}

/**
 * What this month's delivered texts have spent, in all and per member. A failed
 * try and a no-op row spend nothing. `env` holds the budget and the day the
 * month restarts.
 */
export async function textBudget(db: Db, sender: SmsSender, now: Date, env: Env = process.env): Promise<TextBudget> {
  const rows = await db
    .select({ memberId: textMessages.memberId, used: sql<number>`sum(${textMessages.segments})::int` })
    .from(textMessages)
    .where(
      and(
        eq(textMessages.status, "sent"),
        ne(textMessages.provider, NOOP),
        gte(textMessages.createdAt, monthStart(now, monthStartDay(env))),
      ),
    )
    .groupBy(textMessages.memberId);
  const byMember = new Map(rows.map((r) => [r.memberId, r.used]));
  const used = rows.reduce((sum, r) => sum + r.used, 0);
  // Nothing delivered, so nothing to run out of.
  const budget = sender.name === NOOP ? Number.POSITIVE_INFINITY : monthlyBudget(env);
  return { used, budget, remaining: Math.max(0, budget - used), byMember };
}

/** Whether `segments` more would take a member past their month. */
function overMemberCap(budget: Pick<TextBudget, "byMember">, memberId: number, segments: number): boolean {
  return (budget.byMember.get(memberId) ?? 0) + segments > MEMBER_MONTHLY_TEXTS;
}

export interface PlannedText {
  member: Member;
  to: string;
  body: string;
  segments: number;
}

export interface ReminderPlan {
  /** Members with the reminder on, pushed to every device they have. */
  push: MemberProgress[];
  skip: { row: MemberProgress; why: Unreached }[];
}

/** What a reminder can go out through right now. */
export interface ReminderReach {
  /** False when push is not configured on this server. */
  push: boolean;
}

/**
 * Who is reminded, in the order the members joined: everyone behind with the
 * reminder on, by push. Everyone else who is behind is listed with the reason. A
 * member who is complete is in no list. `already` are members not to remind
 * again. Any channel but Push counts as Off, so a row left on Text by hand is
 * skipped, never texted.
 */
export function planReminders(
  report: PickReport,
  already: ReadonlySet<number> = new Set(),
  can: ReminderReach = { push: true },
): ReminderPlan {
  const plan: ReminderPlan = { push: [], skip: [] };
  for (const row of report.members) {
    if (row.complete || already.has(row.member.id)) continue;
    if (!row.member.active) plan.skip.push({ row, why: "deactivated" });
    else if (row.member.reminderChannel !== "push") plan.skip.push({ row, why: "reminder_off" });
    else if (can.push) plan.push.push(row);
    else plan.skip.push({ row, why: "push_not_set_up" });
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
  const result = await sender.send(text.to, text.body, text.member.id);
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
  if ("why" in target) throw new TextRefused(`${member.displayName} was not texted: ${UNTEXTABLE[target.why]}.`);
  const body = magicLinkBody(member, appUrl);
  const segments = segmentsOf(body);
  const budget = await textBudget(db, sender, now);
  if (overMemberCap(budget, member.id, segments)) {
    throw new TextRefused(`${member.displayName} has ${UNTEXTABLE.member_cap}; copy their link and send it by hand.`);
  }
  if (segments > budget.remaining) {
    throw new TextRefused(`${UNTEXTABLE.over_budget}; copy ${member.displayName}'s link and send it by hand.`);
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
  const member = await memberByNumber(db, asked);
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
  const budget = await textBudget(db, sender, now);
  // Answered as for a number nobody holds, so the cap tells nobody who plays.
  if (overMemberCap(budget, member.id, segments)) return "check_your_texts";
  if (segments > budget.remaining) return "budget_spent";
  await deliver(db, sender, "magic_link", null, { member, to: asked, body, segments });
  return "check_your_texts";
}

/** What a reminder goes out through: the push sender, null when push is not set up. */
export interface ReminderSenders {
  push: Pusher | null;
}

export interface PushOutcome {
  member: Member;
  /** At least one device took it. */
  ok: boolean;
  /** Push stopped reaching every device, so the member's reminder turned off. */
  stopped: boolean;
  detail: string;
}

export interface ReminderResult {
  pushed: PushOutcome[];
  skipped: ReminderPlan["skip"];
}

/** Pushes everyone behind on a Week who has the reminder on, and reports who was not reminded. */
export async function remindEveryone(
  db: Db,
  senders: ReminderSenders,
  actor: Commissioner,
  weekId: number,
  now: Date = new Date(),
): Promise<ReminderResult> {
  return sendReminders(db, senders, "reminder", await pickReport(db, weekId, now), now);
}

/** The reminder plan for these senders: the console reads it to show who a press would reach. */
export function reminderPlan(senders: ReminderSenders, report: PickReport, already?: ReadonlySet<number>): ReminderPlan {
  return planReminders(report, already, { push: senders.push !== null });
}

/**
 * Pushes one member's reminder to every device they have and logs it. Devices
 * the push service says are gone are deleted; when none is left (or there were
 * none to begin with), the member's reminder turns off and Settings says push
 * stopped reaching them. A device that failed otherwise keeps its row.
 */
async function pushTo(
  db: Db,
  pusher: Pusher,
  kind: PushKind,
  report: PickReport,
  row: MemberProgress,
  now: Date,
): Promise<PushOutcome> {
  const { member } = row;
  const devices = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, member.id));
  const payload = reminderPush(report, row);
  const outcomes = await Promise.all(
    devices.map(async (d): Promise<[number, SendOutcome]> => [d.id, await pusher.send(d, payload)]),
  );
  const count = (o: SendOutcome) => outcomes.filter(([, outcome]) => outcome === o).length;
  const gone = outcomes.filter(([, outcome]) => outcome === "gone").map(([id]) => id);
  const sent = count("sent");
  const failed = count("failed");
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  const stopped = gone.length === devices.length;
  if (stopped) {
    await db.update(members).set({ reminderChannel: "off", pushStoppedAt: now }).where(eq(members.id, member.id));
  }
  await db.insert(pushMessages).values({ memberId: member.id, kind, weekId: report.week.id, sent, gone: gone.length, failed });
  const detail = stopped
    ? "push stopped reaching their phone, so their reminder turned off"
    : sent === 0
      ? "the push service did not answer"
      : plural(sent, "device");
  return { member, ok: sent > 0, stopped, detail };
}

async function sendReminders(
  db: Db,
  senders: ReminderSenders,
  kind: PushKind,
  report: PickReport,
  now: Date,
  already?: ReadonlySet<number>,
): Promise<ReminderResult> {
  const plan = reminderPlan(senders, report, already);
  const pushed: PushOutcome[] = [];
  if (senders.push) for (const row of plan.push) pushed.push(await pushTo(db, senders.push, kind, report, row, now));
  return { pushed, skipped: plan.skip };
}

export type ScheduledRun =
  | { ran: false; why: string }
  | ({ ran: true; weekNumber: number } & ReminderResult);

/**
 * The daily cron's work: when the latest published Week's Deadline is within
 * the next day, remind whoever is still behind. Cron is best effort and can fire
 * twice, so a member already sent this Week's scheduled reminder by a push that
 * reached a device is not sent it again; the once-a-day schedule makes sure each
 * Deadline falls in exactly one window.
 */
export async function runScheduledReminder(
  db: Db,
  senders: ReminderSenders,
  now: Date = new Date(),
): Promise<ScheduledRun> {
  const slate = await publishedSlate(db);
  if (!slate?.week.deadline) return { ran: false, why: "no published week" };
  const { deadline } = slate.week;
  if (deadline <= now) return { ran: false, why: "deadline has passed" };
  if (deadline.getTime() - now.getTime() > REMINDER_WINDOW_MS) return { ran: false, why: "deadline is more than a day away" };
  const pushedEarlier = await db
    .select({ memberId: pushMessages.memberId })
    .from(pushMessages)
    .where(
      and(eq(pushMessages.weekId, slate.week.id), eq(pushMessages.kind, "scheduled_reminder"), gt(pushMessages.sent, 0)),
    );
  const report = await pickReport(db, slate.week.id, now);
  const result = await sendReminders(
    db,
    senders,
    "scheduled_reminder",
    report,
    now,
    new Set(pushedEarlier.map((r) => r.memberId)),
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
  const names = (rows: { member: Member }[]) => rows.map((r) => r.member.displayName).join(", ");
  const pushed = result.pushed.filter((p) => p.ok);
  const failed = result.pushed.filter((p) => !p.ok);
  const parts: string[] = [pushed.length ? `Pushed ${names(pushed)}.` : "Nobody was reminded."];
  if (failed.length) parts.push(`Failed: ${failed.map((p) => `${p.member.displayName} (${p.detail})`).join("; ")}.`);
  if (result.skipped.length) {
    parts.push(`Not reminded: ${result.skipped.map((s) => `${s.row.member.displayName} (${UNREACHED[s.why]})`).join(", ")}.`);
  }
  return parts.join(" ");
}
