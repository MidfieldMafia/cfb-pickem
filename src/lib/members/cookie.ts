/** Session cookie details shared by the proxy (no database) and the server helpers. */
export const SESSION_COOKIE = "slate_session";

/** A year. Members open the app on Saturdays for a whole season without re-signing in. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
