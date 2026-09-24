/**
 * Feedback (#178, #237): a member's bug report or idea, sent from the You
 * screen and read by commissioners in the console. Not a GitHub issue — the
 * repo is public, so members' words stay in Neon, and a commissioner copies
 * anything worth building into an issue by hand.
 *
 * A screenshot follows `member_photos`: base64 JPEG text in its own table,
 * written in the same batch as its row, and served only to a commissioner.
 */
import "server-only";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import { feedback, feedbackKinds, feedbackScreenshots, members, type FeedbackKind, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { isCommissioner } from "@/lib/members/members";
import { jpegSize } from "@/lib/members/photos";
import { Refusal } from "@/lib/refusal";
import { DAILY_FEEDBACK_LIMIT, MAX_FEEDBACK_TEXT, MAX_SCREENSHOT_BYTES } from "./limits";

export class InvalidFeedback extends Refusal {}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewFeedback {
  kind: string;
  text: string;
  screenshot: Uint8Array | null;
}

/** The send form as it posts: `kind`, `text`, and maybe a `screenshot` file. An empty file is no screenshot. */
export async function readFeedback(form: FormData): Promise<NewFeedback> {
  const screenshot = form.get("screenshot");
  return {
    kind: String(form.get("kind") ?? ""),
    text: String(form.get("text") ?? ""),
    screenshot:
      screenshot instanceof Blob && screenshot.size > 0 ? new Uint8Array(await screenshot.arrayBuffer()) : null,
  };
}

function isKind(kind: string): kind is FeedbackKind {
  return (feedbackKinds as readonly string[]).includes(kind);
}

/**
 * Why these bytes cannot be a screenshot, as a sentence, or null when they
 * can. Size first, so an oversized upload is never parsed.
 */
export function screenshotProblem(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_SCREENSHOT_BYTES) return "That screenshot is too large. Choose it again.";
  if (!jpegSize(bytes)) return "That screenshot couldn’t be read. Choose it again.";
  return null;
}

/**
 * Records one Feedback from `member`. Refused when the kind or text is wrong,
 * when the screenshot is not a small JPEG, or when the member has already sent
 * `DAILY_FEEDBACK_LIMIT` in the day before `now`. The row and its screenshot
 * land together or not at all.
 */
export async function sendFeedback(
  db: Db,
  member: Member,
  input: NewFeedback & { userAgent: string },
  now: Date,
): Promise<number> {
  const text = input.text.trim();
  if (!isKind(input.kind) || !text) throw new InvalidFeedback("Choose Bug or Idea, and say a few words.");
  if (text.length > MAX_FEEDBACK_TEXT) {
    throw new InvalidFeedback(`Keep it to ${MAX_FEEDBACK_TEXT} characters. That’s ${text.length}.`);
  }
  const problem = input.screenshot ? screenshotProblem(input.screenshot) : null;
  if (problem) throw new InvalidFeedback(problem);
  if ((await sentSince(db, member.id, new Date(now.getTime() - DAY_MS))) >= DAILY_FEEDBACK_LIMIT) {
    throw new InvalidFeedback(`You’ve sent ${DAILY_FEEDBACK_LIMIT} today, the most in a day. Try again tomorrow.`);
  }
  const row = { memberId: member.id, kind: input.kind, text, userAgent: input.userAgent, createdAt: now };
  const screenshot = input.screenshot;
  if (!screenshot) {
    const [created] = await db.insert(feedback).values(row).returning({ id: feedback.id });
    return created.id;
  }
  // The screenshot is keyed by the row's id, which exists only once the row
  // does. A batch cannot pass one statement's result to the next, so the
  // second takes the id from the sequence: `currval` is this connection's
  // last value, and the batch is one transaction on one connection.
  const [[created]] = await inOneBatch(db, (tx) => [
    tx.insert(feedback).values(row).returning({ id: feedback.id }),
    tx.insert(feedbackScreenshots).values({
      feedbackId: sql`currval(pg_get_serial_sequence('feedback', 'id'))`,
      bytes: Buffer.from(screenshot).toString("base64"),
    }),
  ]);
  return created.id;
}

async function sentSince(db: Db, memberId: number, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(feedback)
    .where(and(eq(feedback.memberId, memberId), gt(feedback.createdAt, since)));
  return row.n;
}

/** One Feedback as the console lists it. */
export interface FeedbackItem {
  id: number;
  kind: FeedbackKind;
  text: string;
  userAgent: string;
  createdAt: Date;
  doneAt: Date | null;
  member: { id: number; displayName: string; avatarId: string | null };
  hasScreenshot: boolean;
}

/** Every Feedback, newest first. Commissioners only: the type is the check. */
export async function listFeedback(db: Db, _actor: Commissioner): Promise<FeedbackItem[]> {
  const rows = await db
    .select({
      id: feedback.id,
      kind: feedback.kind,
      text: feedback.text,
      userAgent: feedback.userAgent,
      createdAt: feedback.createdAt,
      doneAt: feedback.doneAt,
      memberId: members.id,
      displayName: members.displayName,
      avatarId: members.avatarId,
      screenshot: feedbackScreenshots.feedbackId,
    })
    .from(feedback)
    .innerJoin(members, eq(members.id, feedback.memberId))
    .leftJoin(feedbackScreenshots, eq(feedbackScreenshots.feedbackId, feedback.id))
    .orderBy(desc(feedback.createdAt), desc(feedback.id));
  return rows.map(({ memberId, displayName, avatarId, screenshot, ...item }) => ({
    ...item,
    member: { id: memberId, displayName, avatarId },
    hasScreenshot: screenshot !== null,
  }));
}

/** How many are not yet Done, for the console nav's count. */
export async function openFeedbackCount(db: Db, _actor: Commissioner): Promise<number> {
  const [row] = await db.select({ n: count() }).from(feedback).where(isNull(feedback.doneAt));
  return row.n;
}

/** Files a Feedback under Done, or takes it back out. Members never see this. */
export async function setFeedbackDone(
  db: Db,
  actor: Commissioner,
  feedbackId: number,
  done: boolean,
  now: Date,
): Promise<void> {
  const [updated] = await db
    .update(feedback)
    .set({ doneAt: done ? now : null })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
  if (!updated) throw new InvalidFeedback("That feedback is gone.");
}

export interface ScreenshotRoute {
  db: Db;
  currentMember: () => Promise<Member | null>;
}

/**
 * `GET /console/feedback/<id>/screenshot`, for commissioners only. Anyone
 * else gets the 404 the rest of the console gives them. Unlike a Pennant, which
 * every member may see and may cache for a year, a screenshot is whatever was
 * on one member's phone, so nothing along the way may keep a copy.
 */
export async function serveScreenshot(route: ScreenshotRoute, params: { id: string }): Promise<Response> {
  const viewer = await route.currentMember();
  const id = Number(params.id);
  if (!viewer || !isCommissioner(viewer) || !Number.isSafeInteger(id) || id < 1) return notFound();
  const row = await route.db.query.feedbackScreenshots.findFirst({ where: eq(feedbackScreenshots.feedbackId, id) });
  if (!row) return notFound();
  const bytes = Buffer.from(row.bytes, "base64");
  return new Response(bytes, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.length), "Cache-Control": NO_STORE },
  });
}

const NO_STORE = "private, no-store";

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": NO_STORE } });
}
