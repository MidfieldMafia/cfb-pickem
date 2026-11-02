/**
 * The numbers Chat is held to (#177), shared by the composer on the phone and
 * the server that enforces them. Free of server imports so the composer can
 * read them; the server never trusts the composer to have.
 */

/** The most characters one message may say. */
export const MAX_CHAT_TEXT = 280;
/**
 * The most characters the stored text may hold. A mention is kept as a token
 * (`<@1234>`, `<@everyone>`) that can be longer than the name it shows, so the
 * column gets headroom; `MAX_CHAT_TEXT` is still the limit, on the rendered text.
 */
export const MAX_STORED_CHAT_TEXT = 1000;
