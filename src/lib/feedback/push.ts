/**
 * The New Feedback push (#533, rules on #493): commissioners hear when a
 * member sends Feedback. The send form runs `pushNewFeedback` in `after()`
 * once the Feedback is saved, so Send never waits on the push services.
 *
 * Reserved under `feedback:<id>` before it goes, so it sends once. Recipients
 * are commissioners in good standing with New Feedback on
 * (`members.notify_feedback`) and a device, never the sender. A member's own
 * setting is never read: only a commissioner's counts. The 10-a-day send limit
 * keeps it from flooding.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { feedback, members, type FeedbackKind } from "@/db/schema";
import type { Db } from "@/db/types";
import { isCommissioner } from "@/lib/members/members";
import { pushToMember } from "@/lib/push/deliver";
import { pushKey, reserve } from "@/lib/push/reservations";
import type { Pusher, PushPayload } from "@/lib/push/sender";
import { membersWithDevices } from "@/lib/push/settings";

/** A day: Feedback waits in the console anyway. */
export const FEEDBACK_TTL = 24 * 60 * 60;

/** Where every New Feedback push opens. */
export const FEEDBACK_LINK = "/console/feedback";

/** About how much of the first line a banner carries. */
const FIRST_LINE = 120;

const KIND: Record<FeedbackKind, string> = { bug: "a bug", idea: "an idea" };

/** `Grandma sent a bug`, or `an idea`. */
export const feedbackTitle = (sender: string, kind: FeedbackKind) => `${sender} sent ${KIND[kind]}`;

/** The Feedback's first line that says anything, cut at about 120 characters. */
export function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const chars = [...line];
  return chars.length <= FIRST_LINE ? line : `${chars.slice(0, FIRST_LINE - 1).join("").trimEnd()}…`;
}

export interface FeedbackPushSent {
  memberId: number;
  /** Devices that took it. */
  sent: number;
}

/** Pushes Feedback `feedbackId` to every commissioner who wants it but its sender, and says what went. */
export async function pushNewFeedback(db: Db, pusher: Pusher, feedbackId: number, now: Date = new Date()): Promise<FeedbackPushSent[]> {
  const [row] = await db
    .select({ kind: feedback.kind, text: feedback.text, memberId: feedback.memberId, sender: members.displayName })
    .from(feedback)
    .innerJoin(members, eq(members.id, feedback.memberId))
    .where(eq(feedback.id, feedbackId));
  if (!row) return [];
  const [commissioners, devices] = await Promise.all([
    db.select().from(members).where(and(eq(members.isCommissioner, true), eq(members.notifyFeedback, true))),
    membersWithDevices(db),
  ]);
  const recipients = commissioners.filter((m) => isCommissioner(m) && m.id !== row.memberId && devices.has(m.id));
  if (recipients.length === 0) return [];
  if (!(await reserve(db, pushKey.feedback(feedbackId)))) return [];
  const payload: PushPayload = {
    title: feedbackTitle(row.sender, row.kind),
    body: firstLine(row.text),
    url: FEEDBACK_LINK,
    tag: `feedback-${feedbackId}`,
  };
  return Promise.all(
    recipients.map(async (m): Promise<FeedbackPushSent> => {
      const delivery = await pushToMember(db, pusher, m.id, payload, { ttl: FEEDBACK_TTL }, now);
      return { memberId: m.id, sent: delivery.sent };
    }),
  );
}
