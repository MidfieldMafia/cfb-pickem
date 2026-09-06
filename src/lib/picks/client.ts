/**
 * The browser side of the pick entry API: one PUT helper the pick flow and
 * the review screen share, and the error shape the route handlers send.
 * Client-safe: no database imports.
 */

export interface ApiError {
  error: string;
  /** True when the Deadline has passed, so the client can flip to its locked state. */
  locked?: boolean;
}

export type PutResult<T> =
  | { ok: true; body: T }
  | { ok: false; error: string; /** The Deadline passed under us. */ locked: boolean };

/** PUT a JSON body; never throws. A 423 comes back as `locked: true`. */
export async function put<T extends { serverNow: string }>(path: string, body: unknown): Promise<PutResult<T>> {
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true, body: (await response.json()) as T };
    const data = (await response.json().catch(() => ({}))) as Partial<ApiError>;
    return { ok: false, error: data.error ?? "That didn't save. Try again.", locked: !!data.locked };
  } catch {
    return { ok: false, error: "No connection. Try again.", locked: false };
  }
}
