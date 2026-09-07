/**
 * The browser side of the pick entry API: one PUT helper the pick flow and
 * the review screen share, and the error shape the route handlers send.
 * Client-safe: no database imports.
 */

export interface ApiError<T = never> {
  error: string;
  /** True when the Deadline has passed, so the client can flip to its locked state. */
  locked?: boolean;
  /**
   * The server's own answer as of the refusal — the same shape a 200 returns.
   * Sent with a 423, the one refusal where the server holds state the caller
   * provably does not: the Deadline passed under them. A 400 leaves the sheet
   * as the caller already has it, and a 403 is the screen they may not see, so
   * neither carries one.
   */
  sheet?: T;
}

export type PutResult<T> =
  | { ok: true; body: T }
  | {
      ok: false;
      error: string;
      /** The Deadline passed under us. */
      locked: boolean;
      /** Present when the refusal carried the server's answer; read it instead of guessing. */
      body?: T;
    };

/** PUT a JSON body; never throws. A 423 comes back as `locked: true`, with the server's sheet as `body`. */
export async function put<T extends { serverNow: string }>(path: string, body: unknown): Promise<PutResult<T>> {
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true, body: (await response.json()) as T };
    const data = (await response.json().catch(() => ({}))) as Partial<ApiError<T>>;
    return {
      ok: false,
      error: data.error ?? "That didn't save. Try again.",
      locked: !!data.locked,
      body: data.sheet,
    };
  } catch {
    return { ok: false, error: "No connection. Try again.", locked: false };
  }
}
