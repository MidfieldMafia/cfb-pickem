import "server-only";
import type { Game, Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { needsReview, REVIEW_AFTER_MS } from "@/lib/results/results";
import { chatPreview } from "./chat-notify";
import type { PushPayload } from "./payload";
import type { Pusher } from "./sender";
import { commissionerDevices, deliver, type Delivery } from "./subscriptions";

const NONE: Delivery = { sent: 0, gone: 0, failed: 0 };

async function toCommissioners(
  db: Db,
  pusher: Pusher | null,
  kind: "feedback" | "review" | "rollCall",
  payload: PushPayload,
  now: Date,
  what: string,
): Promise<Delivery> {
  if (!pusher) return NONE;
  try {
    const devices = await commissionerDevices(db, kind);
    if (devices.length === 0) return NONE;
    return await deliver(db, pusher, devices, () => payload, now);
  } catch (error) {
    console.warn(`${what} push skipped:`, error instanceof Error ? error.message : error);
    return NONE;
  }
}

/** A member sent feedback: every commissioner with Feedback on hears, with the first line of it. */
export function notifyFeedback(
  db: Db,
  pusher: Pusher | null,
  from: Pick<Member, "displayName">,
  kind: string,
  text: string,
  now: Date = new Date(),
): Promise<Delivery> {
  const label = kind === "bug" ? "a bug" : kind === "idea" ? "an idea" : "feedback";
  return toCommissioners(
    db,
    pusher,
    "feedback",
    {
      title: `${from.displayName} sent ${label}`,
      body: chatPreview(text),
      url: "/console/feedback",
      tag: "feedback",
      badge: null,
    },
    now,
    "Feedback",
  );
}

/**
 * The games that crossed into needing review between two ingests: still
 * pending `REVIEW_AFTER_MS` after kickoff now, and not yet at that point when
 * the feed was last read. Read off the week's previous fetch time, so a game
 * is flagged once as it crosses the line, however many polls follow.
 */
export function newlyNeedingReview(games: Game[], previousFetch: Date | null, now: Date): Game[] {
  return games.filter((game) => needsReview(game, now) && !(previousFetch && needsReview(game, previousFetch)));
}

/** A game the feed never settled: the commissioners with Review on hear, once, that it is theirs to set or void. */
export function notifyReview(db: Db, pusher: Pusher | null, games: Game[], now: Date = new Date()): Promise<Delivery> {
  if (games.length === 0) return Promise.resolve(NONE);
  const hours = Math.round(REVIEW_AFTER_MS / 3600_000);
  const names = games.map((g) => `${g.awayTeam} at ${g.homeTeam}`);
  const body =
    games.length === 1
      ? `${names[0]} still isn't final ${hours} hours after kickoff. Set the score, or void it.`
      : `${games.length} games still aren't final ${hours} hours after kickoff: ${names.join("; ")}. Set the scores, or void them.`;
  return toCommissioners(
    db,
    pusher,
    "review",
    { title: "A result needs you", body, url: "/console/results", tag: "review", badge: null },
    now,
    "Review",
  );
}

/**
 * The Deadline roll call: when the reminder job runs, the commissioners with
 * Roll call on get one line naming who is still behind, texted or not.
 */
export function notifyRollCall(
  db: Db,
  pusher: Pusher | null,
  weekNumber: number,
  behind: Pick<Member, "displayName">[],
  now: Date = new Date(),
): Promise<Delivery> {
  if (behind.length === 0) return Promise.resolve(NONE);
  const names = behind.map((m) => m.displayName);
  const shown = names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", ");
  return toCommissioners(
    db,
    pusher,
    "rollCall",
    {
      title: `Week ${weekNumber} roll call`,
      body: `${names.length === 1 ? "1 member hasn't" : `${names.length} members haven't`} picked yet: ${shown}.`,
      url: "/console/picks",
      tag: `roll-call-${weekNumber}`,
      badge: null,
    },
    now,
    "Roll call",
  );
}
