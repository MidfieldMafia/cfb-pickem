import { randomBytes } from "node:crypto";

/** A URL-safe secret: 32 random bytes, 43 characters. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}
