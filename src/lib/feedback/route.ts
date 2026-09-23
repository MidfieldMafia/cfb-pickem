/**
 * The two Feedback forms as they post, over an injected route, so the
 * `"use server"` files stay a line per action and a test can run the rest.
 * Who is sending comes from the session, never from the form.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { consoleAction, type ConsoleRoute } from "@/lib/console/route";
import type { EditOutcome } from "@/lib/console/state";
import { integerField } from "@/lib/parse";
import { Refusal } from "@/lib/refusal";
import { InvalidFeedback, readFeedback, sendFeedback, setFeedbackDone } from "./feedback";
import type { FeedbackState } from "./limits";

export interface FeedbackRoute {
  db: Db;
  requireMember: () => Promise<Member>;
  /** The sender's `User-Agent` header, recorded so a commissioner knows the phone. */
  userAgent: () => Promise<string>;
  /** The wall clock unless given. */
  now?: () => Date;
}

/** The You screen's Send feedback form. A refusal is the sentence above Send. */
export async function sendFromForm(route: FeedbackRoute, form: FormData): Promise<FeedbackState> {
  const member = await route.requireMember();
  try {
    const input = await readFeedback(form);
    const id = await sendFeedback(route.db, member, { ...input, userAgent: await route.userAgent() }, route.now?.() ?? new Date());
    return { sent: id };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { error: error.message };
  }
}

/**
 * The console's Done and Not done buttons. Both are always drawn for a row
 * that exists, so a refusal here is a fault and goes to the error page.
 * The console nav's count re-renders with the page, since its layout is part of the refresh.
 */
export async function markFromForm(route: ConsoleRoute, form: FormData): Promise<EditOutcome> {
  return consoleAction(route, async ({ db, actor, now }) => {
    const id = integerField(form, "feedbackId", (name) => new InvalidFeedback(`Missing ${name}.`));
    await setFeedbackDone(db, actor, id, form.get("done") === "true", now);
    return { revalidate: ["/console/feedback"] };
  });
}
