/**
 * Texting is off. Since 2026-10-23 Pingram fails every text from its shared
 * number: US carriers need a registered sender (10DLC), and the app has none.
 * Rather than log texts as sent that never arrive, nothing texts while this is
 * true: the console's Text buttons are gone and the signed-out "Text me my
 * link" form becomes a note, so links go out by Copy link. The Pick reminder
 * is never texted either way: it goes by push or not at all (#475).
 *
 * The sending code is untouched, so setting this to false brings Magic Link
 * texts back, and only those.
 * STOP and START from the webhook still apply either way.
 */
export const TEXTING_PAUSED: boolean = true;

/** What a send path answers while texting is paused. */
export const TEXTING_PAUSED_REASON = "Texting is paused. Copy the link or reminder and send it yourself.";
