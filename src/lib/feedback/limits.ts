/**
 * The numbers Feedback is held to (#178), shared by the form on the phone and
 * the server that enforces them. Free of server imports so the form can read
 * them; the server never trusts the form to have.
 */

/** The most characters one Feedback may say. */
export const MAX_FEEDBACK_TEXT = 1000;

/** How many a member may send in any rolling day. */
export const DAILY_FEEDBACK_LIMIT = 10;

/** The long edge the phone shrinks a screenshot to before it is sent. */
export const SCREENSHOT_LONG_EDGE = 1600;

/** Far above what a 1600px JPEG comes to, so only something the phone did not shrink is refused. */
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;

/**
 * What the send form's action answers: a refusal to show above Send, or that
 * it was sent. `sent` is the new Feedback's id, so the form can tell one thanks from the next.
 */
export interface FeedbackState {
  error?: string;
  sent?: number;
}
