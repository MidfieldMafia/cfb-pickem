/**
 * The Send a push form's limits and choices, kept free of server imports so
 * the form in the browser counts against the same numbers the server checks.
 */

/** About what a lock-screen banner shows before it cuts. */
export const MAX_PUSH_TITLE = 60;
export const MAX_PUSH_BODY = 180;

/** Where a tap can open, by path. Kept to the member screens every member can reach. */
export const PUSH_LINKS = [
  { url: "/", label: "Home" },
  { url: "/picks", label: "Picks" },
  { url: "/live", label: "Live board" },
  { url: "/leaderboard", label: "Leaderboard" },
  { url: "/chat", label: "Chat" },
] as const;
