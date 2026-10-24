/**
 * Texting is off. Since 2026-10-23 Pingram fails every text from its shared
 * number: US carriers need a registered sender (10DLC), and the app has none.
 * Rather than log texts as sent that never arrive, nothing texts while this is
 * true: the console's Text buttons are gone, the daily reminder and the
 * console's Remind button reach only members with push on (#454), and the
 * signed-out "Text me my link" form becomes a note. Everyone else's reminder
 * goes out by hand (the console's Copy reminder) and links by Copy link.
 *
 * The sending code is untouched, so setting this to false brings all of it back.
 * STOP and START from the webhook still apply either way.
 */
export const TEXTING_PAUSED: boolean = true;

/** What a send path answers while texting is paused. */
export const TEXTING_PAUSED_REASON = "Texting is paused. Copy the link or reminder and send it yourself.";
