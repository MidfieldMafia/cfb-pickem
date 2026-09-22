import "server-only";
import { eq } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import { memberPhotos, members, sessions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { findAvatar } from "@/lib/avatars";
import { Refusal } from "@/lib/refusal";
import { cleanDisplayName, MAX_DISPLAY_NAME } from "./limits";
import { newSecret } from "./members";
import { isPhotoId, photoIdFor, photoProblem } from "./photos";

export interface SignIn {
  sessionId: string;
  member: Member;
}

/** Trades a Magic Link token for a session. Null when the link is unknown or the member is deactivated. */
export async function exchangeToken(db: Db, token: string): Promise<SignIn | null> {
  const member = await db.query.members.findFirst({ where: eq(members.token, token) });
  if (!member || !member.active) return null;
  const sessionId = newSecret();
  const now = new Date();
  await Promise.all([
    db.insert(sessions).values({ id: sessionId, memberId: member.id, lastSeenAt: now }),
    db.update(members).set({ lastSeenAt: now }).where(eq(members.id, member.id)),
  ]);
  return { sessionId, member: { ...member, lastSeenAt: now } };
}

/** The member behind a session cookie, or null when the session is gone or the member is deactivated. */
export async function getSession(db: Db, sessionId: string): Promise<Member | null> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { member: true },
  });
  if (!session || !session.member.active) return null;
  return session.member;
}

export class InvalidWelcome extends Refusal {}

/** What `avatarId` says when the form also carries a new photo in its `photo` field. */
export const NEW_PHOTO = "photo";

export interface WelcomeInput {
  displayName: string;
  avatarId: string;
  /** The cropped JPEG, present only when `avatarId` is `NEW_PHOTO`. */
  photo?: Uint8Array | null;
}

/**
 * The welcome form's fields. An empty file input still posts a zero-byte
 * `File`, which is read as no photo rather than as a photo that is too small.
 */
export async function readWelcome(form: FormData): Promise<WelcomeInput> {
  const photo = form.get("photo");
  return {
    displayName: String(form.get("displayName") ?? ""),
    avatarId: String(form.get("avatarId") ?? ""),
    photo: photo instanceof Blob && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : null,
  };
}

/**
 * The welcome page: a display name and a Pennant, which is one of three:
 *
 * - `NEW_PHOTO` with a JPEG in `photo`: make this photo my pennant.
 * - my current `photo-<memberId>-<hash8>` with no `photo`: keep it.
 * - a flag or `team-<espnId>` with no `photo`: as ever, and any photo I had goes.
 *
 * Anything else is refused. The name, `avatarId` and photo row are written in
 * one batch, so a dropped request changes nothing: a member never points at a
 * photo that is not there, and never leaves one behind that nothing points at.
 */
export async function completeWelcome(db: Db, member: Member, input: WelcomeInput): Promise<Member> {
  const displayName = cleanDisplayName(input.displayName);
  if (displayName === null) {
    throw new InvalidWelcome(`Pick a name between 1 and ${MAX_DISPLAY_NAME} characters.`);
  }
  const photo = input.photo ?? null;
  const set = { displayName, welcomedAt: member.welcomedAt ?? new Date() };
  const self = eq(members.id, member.id);

  if (input.avatarId === NEW_PHOTO) {
    if (!photo) throw new InvalidWelcome("Choose a photo first.");
    const problem = photoProblem(photo);
    if (problem) throw new InvalidWelcome(problem);
    const row = { bytes: Buffer.from(photo).toString("base64"), updatedAt: new Date() };
    const [, [updated]] = await inOneBatch(db, (tx) => [
      tx
        .insert(memberPhotos)
        .values({ memberId: member.id, ...row })
        .onConflictDoUpdate({ target: memberPhotos.memberId, set: row }),
      tx
        .update(members)
        .set({ ...set, avatarId: photoIdFor(member.id, photo) })
        .where(self)
        .returning(),
    ]);
    return updated;
  }

  if (photo) throw new InvalidWelcome("Pick a photo or a pennant, not both.");
  if (!findAvatar(input.avatarId)) throw new InvalidWelcome("Pick one of the pennants.");

  if (isPhotoId(input.avatarId)) {
    // Keeping a photo is only ever keeping your own current one.
    if (input.avatarId !== member.avatarId) throw new InvalidWelcome("Pick one of the pennants.");
    const [updated] = await db.update(members).set(set).where(self).returning();
    return updated;
  }

  const [, [updated]] = await inOneBatch(db, (tx) => [
    tx.delete(memberPhotos).where(eq(memberPhotos.memberId, member.id)),
    tx
      .update(members)
      .set({ ...set, avatarId: input.avatarId })
      .where(self)
      .returning(),
  ]);
  return updated;
}
