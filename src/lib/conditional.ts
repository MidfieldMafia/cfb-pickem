/**
 * Both ends of a conditional GET: the phone asks again with the ETag of what
 * it holds, and an unchanged answer costs a 304 and no body. The week state,
 * a Game's plays and a Group's Chat thread all poll this way — the server
 * answers with `conditionalJson`, the browser asks with `conditionalGet`, and
 * `usePoll` is the loop that keeps asking. Client-safe: no database imports.
 */

/** What one ask came back as. */
export type ConditionalAnswer<T> =
  | { kind: "fresh"; body: T; etag: string | null }
  /** The server matched the ETag: what the phone holds is what it would have sent. */
  | { kind: "unchanged" }
  /**
   * Refused, or never answered. `status` is null for a dead connection;
   * `error` is the sentence a refusal carried, when it carried one.
   */
  | { kind: "failed"; status: number | null; error: string | null };

/**
 * Asks `path` again, carrying `etag` when there is one. Never throws — every
 * caller is a timer on a phone that has to keep going.
 *
 * `cache: "no-store"` matters twice over: it keeps the browser's own HTTP
 * cache out of the way, and it is what lets a 304 reach this code as a 304 —
 * in the default mode the browser would answer it from cache as a 200 and the
 * phone could not tell "unchanged" from "here it is again".
 */
export async function conditionalGet<T>(path: string, etag: string | null): Promise<ConditionalAnswer<T>> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: etag ? { "if-none-match": etag } : {},
    });
    if (response.status === 304) return { kind: "unchanged" };
    if (!response.ok) return { kind: "failed", status: response.status, error: await refusalSentence(response) };
    return { kind: "fresh", body: (await response.json()) as T, etag: response.headers.get("etag") };
  } catch {
    return { kind: "failed", status: null, error: null };
  }
}

/** The `{ error }` a refusal answers with, or null when its body is not that. */
async function refusalSentence(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
    return typeof error === "string" ? error : null;
  } catch {
    return null;
  }
}

/**
 * The server's answer to a poll: `body` with its `etag`, or a 304 with no
 * body when the request already holds that tag. `request` is null for an
 * answer no poll asked for — a write that answers the thread it produced.
 *
 * `no-store` on both: the browser must not answer a later poll from its own
 * cache, and the 304 must reach the script.
 */
export function conditionalJson(request: Request | null, body: unknown, etag: string): Response {
  const headers = { etag, "cache-control": "no-store" };
  if (request?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(body, { headers });
}
