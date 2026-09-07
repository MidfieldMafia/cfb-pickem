/**
 * The marker a refusal carries: an error whose message is meant to be read by
 * the person who asked for the thing, rather than a fault for the error page.
 *
 * It exists because the test for "is this a message?" was an enumeration.
 * `console/route.ts` named four classes; eight errors existed, and the two
 * that mattered most were the ones it did not name — a CollegeFootballData
 * outage threw a commissioner past the screen to the error page instead of
 * putting a sentence under the button. The header on that file already said
 * why: four action files had each had their own `catch` and they had drifted.
 * The enumeration reproduced the same drift one level up, so the answer is a
 * marker each module's error extends and one `instanceof` for the whole set.
 *
 * Extended by `InvalidPick`, `InvalidMember`, `InvalidResult`, `InvalidSlate`,
 * `InvalidWelcome` and `CfbdError`. Two errors deliberately stay off it, and
 * both are refusals a screen must answer some other way than a sentence:
 *
 * - `NotCommissioner` — the console answers a non-commissioner with
 *   `notFound()`, so telling them what they are not allowed to do would be
 *   the one screen that admits the console exists.
 * - `PicksHidden` — the pick API answers 403 and no form asks for another
 *   member's picks before the Deadline, so reaching it from a console edit
 *   would be this code malfunctioning rather than a person mistyping.
 *
 * A new error class is a refusal if a person can cause it by typing something
 * wrong or by asking at the wrong time, and a fault otherwise.
 */
export class Refusal extends Error {}
