/**
 * A member's own photo as their Pennant (#222, #223, #230): what the server
 * accepts, where it is kept, how it is served, and how a commissioner clears
 * it. The crop happens in the browser; by the time bytes reach here they are
 * meant to be one finished 216×216 JPEG, and nothing about them is trusted.
 *
 * The welcome form's Save is the only way a photo is written, so the write
 * itself is in `completeWelcome`; this module gives it the checks and the id.
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import { memberPhotos, members, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { findAvatar, photoAvatarId } from "@/lib/avatars";
import type { Commissioner } from "./authority";
import { InvalidMember } from "./members";

/** The one size a photo pennant is stored at: 72 at 3×. */
export const PHOTO_SIZE = 216;

/** A 216 JPEG at the crop's quality is a fraction of this; anything bigger is not what the crop made. */
export const MAX_PHOTO_BYTES = 100 * 1024;

/**
 * Why these bytes cannot be a photo pennant, as a sentence for the welcome
 * form, or null when they can. Size first, so a huge upload is never parsed.
 */
export function photoProblem(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_PHOTO_BYTES) return "That photo is too large. Crop it again.";
  const size = jpegSize(bytes);
  if (!size) return "That photo is not a JPEG. Crop it again.";
  if (size.width !== PHOTO_SIZE || size.height !== PHOTO_SIZE) {
    return `That photo is ${size.width}×${size.height}, not ${PHOTO_SIZE}×${PHOTO_SIZE}. Crop it again.`;
  }
  return null;
}

/**
 * A JPEG's dimensions, from its start-of-frame header, or null when the bytes
 * are not a JPEG (no `FF D8 FF`) or end before a frame header does. Walks the
 * marker segments rather than searching for `FF C0`, which can appear inside
 * an EXIF thumbnail or any other segment's payload.
 */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Fill bytes: any number of FFs may pad before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Restart markers and TEM stand alone, with no length.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    // Scan data or the end: no frame header came first.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (isFrameHeader(marker)) {
      if (at + 9 > bytes.length) return null;
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + length;
  }
  return null;
}

/** SOF0–SOF15, less the three markers in that range that are not frames: DHT, JPG and DAC. */
function isFrameHeader(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** The first eight hex characters of the bytes' SHA-256: the part of the id that changes when the photo does. */
export function photoHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

/** The `avatarId` these bytes are stored under for this member. */
export function photoIdFor(memberId: number, bytes: Uint8Array): string {
  return photoAvatarId(memberId, photoHash(bytes));
}

export function isPhotoId(avatarId: string | null | undefined): boolean {
  return findAvatar(avatarId)?.kind === "photo";
}

export interface PhotoRoute {
  db: Db;
  currentMember: () => Promise<Member | null>;
}

/** `private`: the pool is reached only by a Magic Link. `immutable`: a new photo is a new URL. */
const CACHE = "private, max-age=31536000, immutable";

const FILE = /^([0-9a-f]{8})\.jpg$/;

/**
 * `GET /pennants/<memberId>/<hash8>.jpg`. Any signed-in member may see any
 * photo, as they see every Pennant on a board. The hash is checked against the
 * bytes themselves, so a replaced or cleared photo's old URL is a 404 even
 * though the member id still has a row.
 */
export async function servePhoto(route: PhotoRoute, params: { memberId: string; file: string }): Promise<Response> {
  if (!(await route.currentMember())) return new Response(null, { status: 401 });
  const memberId = Number(params.memberId);
  const hash8 = FILE.exec(params.file)?.[1];
  if (!Number.isSafeInteger(memberId) || memberId < 1 || !hash8) return notFound();
  const row = await route.db.query.memberPhotos.findFirst({ where: eq(memberPhotos.memberId, memberId) });
  if (!row) return notFound();
  const bytes = Buffer.from(row.bytes, "base64");
  if (photoHash(bytes) !== hash8) return notFound();
  return new Response(bytes, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.length), "Cache-Control": CACHE },
  });
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * The moderation floor (#176): a commissioner takes a photo down, and the
 * member shows their initial until they pick again. The row goes and
 * `avatarId` is nulled in one batch. Not audited, matching `setPhone`.
 */
export async function clearPhoto(db: Db, actor: Commissioner, memberId: number): Promise<Member> {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new InvalidMember("No such member.");
  if (!isPhotoId(member.avatarId)) throw new InvalidMember(`${member.displayName} has no photo.`);
  const [, [cleared]] = await inOneBatch(db, (tx) => [
    tx.delete(memberPhotos).where(eq(memberPhotos.memberId, memberId)),
    tx.update(members).set({ avatarId: null }).where(eq(members.id, memberId)).returning(),
  ]);
  return cleared;
}
