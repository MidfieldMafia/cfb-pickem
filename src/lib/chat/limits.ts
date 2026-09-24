/**
 * The numbers Chat is held to (#177), shared by the composer on the phone and
 * the server that enforces them. Free of server imports so the composer can
 * read them; the server never trusts the composer to have.
 */

/** The most characters one message may say. */
export const MAX_CHAT_TEXT = 280;
