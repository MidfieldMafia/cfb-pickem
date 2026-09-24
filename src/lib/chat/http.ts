/**
 * The Chat API (#248) as functions over an injected `ChatRoute`, the way
 * `api/week/handlers.ts` serves the pick API: the `route.ts` files bind the real
 * database, session and group cookie and export these under the names Next
 * looks for; a test binds PGlite and a seeded member.
 *
 * The thread and the composer name their Group in the request — `?group=` on
 * a read, `group` in a post's body — rather than taking it from the device's
 * remembered group. That cookie is a preference that falls back to another of
 * the member's groups once they leave or are removed, or changes when they
 * switch boards in another tab; a message typed into one thread must never
 * land in another. The badge alone follows the cookie, since it counts for
 * whichever board is on screen.
 *
 * Reading the thread moves the reader's last-read marker. The only reader is
 * the open Chat screen, whose poll stops while it is hidden, so a read here is
 * the member looking at the thread.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import { chatThread, markRead, NotInGroup, postMessage, setReaction, unreadCount } from "./chat";
import { toChatStateJson, type ChatStateJson, type ChatUnreadJson } from "./json";
import { isChatReactionKind } from "./reactions";

export interface ChatRoute {
  db: Db;
  currentMember: () => Promise<Member | null>;
  /** The Group on screen, from the device's remembered choice; null for a member in none. Only the badge reads it. */
  currentGroup: () => Promise<number | null>;
  /** The wall clock unless given. */
  now?: () => Date;
}

interface ApiError {
  error: string;
}

const NO_STORE = { "cache-control": "no-store" };

/**
 * A digest of the thread but not the clock, which moves on every request. The
 * group is in it for the reason it is in the week state's: two threads can
 * read alike, and a phone switching between them must not be handed a 304.
 */
function chatEtag(state: ChatStateJson, group: number): string {
  const digest = createHash("sha1")
    .update(JSON.stringify({ messages: state.messages, senders: state.senders, group }))
    .digest("hex");
  return `W/"${digest.slice(0, 20)}"`;
}

type Context = { db: Db; member: Member; group: number; now: Date };

const refuse = (error: string, status: number) => Response.json({ error } satisfies ApiError, { status, headers: NO_STORE });

/** A group id as the request carries it: a positive integer, or null. */
function groupParam(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Signs the request in and runs `run` for `group`, turning a refusal into its
 * sentence: 403 for a Group the member is not in, 400 for anything else.
 * `group` is resolved by the caller, so each route says where its Group comes from.
 */
async function withChatContext(
  route: ChatRoute,
  group: (route: ChatRoute) => Promise<number | null> | number | null,
  run: (context: Context) => Promise<Response>,
): Promise<Response> {
  const member = await route.currentMember();
  if (!member) return refuse("Open your Magic Link to sign in.", 401);
  const groupId = await group(route);
  if (groupId === null) return refuse("Join a group to chat.", 404);
  try {
    return await run({ db: route.db, member, group: groupId, now: route.now?.() ?? new Date() });
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return refuse(error.message, error instanceof NotInGroup ? 403 : 400);
  }
}

/** The thread, marked read, with an ETag; `If-None-Match` on an unchanged thread gets a 304. */
async function answerThread(request: Request | null, { db, member, group, now }: Context): Promise<Response> {
  const thread = await chatThread(db, member, group);
  await markRead(db, member.id, group, thread);
  const state = toChatStateJson(thread, now);
  const etag = chatEtag(state, group);
  const headers = { ...NO_STORE, etag };
  if (request?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(state, { headers });
}

/** `GET /api/chat?group=<id>`: that Group's thread, for the Chat screen's poll. */
export function getChat(request: Request, route: ChatRoute): Promise<Response> {
  const group = groupParam(new URL(request.url).searchParams.get("group"));
  return withChatContext(route, () => group, (context) => answerThread(request, context));
}

/** `POST /api/chat` with `{ group, text }`: posts, then answers the thread it is now part of. */
export async function postChat(request: Request, route: ChatRoute): Promise<Response> {
  let body: { group?: unknown; text?: unknown } = {};
  try {
    body = ((await request.json()) as typeof body) ?? {};
  } catch {
    // Not JSON: no group and no text, refused below like any other empty post.
  }
  const group = groupParam(body.group);
  return withChatContext(route, () => group, async (context) => {
    if (typeof body.text !== "string") return refuse("Say something first.", 400);
    await postMessage(context.db, context.member, context.group, body.text, context.now);
    return answerThread(null, context);
  });
}

/**
 * `POST /api/chat/reactions` with `{ group, message, kind }`: sets the member's
 * reaction to that message, `kind` null taking it off, then answers the thread.
 */
export async function postChatReaction(request: Request, route: ChatRoute): Promise<Response> {
  let body: { group?: unknown; message?: unknown; kind?: unknown } = {};
  try {
    body = ((await request.json()) as typeof body) ?? {};
  } catch {
    // Not JSON: refused below like any other post naming nothing.
  }
  const group = groupParam(body.group);
  return withChatContext(route, () => group, async (context) => {
    const message = groupParam(body.message);
    if (message === null) return refuse("That message is gone.", 400);
    if (body.kind !== null && !isChatReactionKind(body.kind)) return refuse("That is not a reaction.", 400);
    await setReaction(context.db, context.member, context.group, message, body.kind, context.now);
    return answerThread(null, context);
  });
}

/** `GET /api/chat/unread`: the badge's count for the Group on screen. */
export function getChatUnread(route: ChatRoute): Promise<Response> {
  return withChatContext(route, (r) => r.currentGroup(), async ({ db, member, group }) =>
    Response.json({ unread: await unreadCount(db, member.id, group) } satisfies ChatUnreadJson, { headers: NO_STORE }),
  );
}
