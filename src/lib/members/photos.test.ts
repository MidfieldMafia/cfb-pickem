/**
 * A member's photo as their Pennant, through the one door it comes in by —
 * the welcome form's Save — and out by the URL `findAvatar` resolves it to.
 * The crop UI is not built yet, so these post what it will post: a 216×216
 * JPEG as `photo`, beside `avatarId=photo`.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { memberPhotos, members, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { findAvatar } from "@/lib/avatars";
import { form, routeFor } from "@/test/console";
import { jpeg, png, welcomeForm } from "@/test/photo";
import { seedWeek2, THURSDAY } from "@/test/week-2";
import { completeWelcome, InvalidWelcome, readWelcome } from "./auth";
import { clearMemberPhoto } from "./console-edits";
import { removeMember, setMemberActive } from "./members";
import { clearPhoto, jpegSize, MAX_PHOTO_BYTES, photoProblem, servePhoto } from "./photos";
import { eq } from "drizzle-orm";

/** Posts the welcome form as `member`, the way `saveWelcome` does. */
async function save(db: Db, member: Member, fields: Parameters<typeof welcomeForm>[0]): Promise<Member> {
  const fresh = (await db.query.members.findFirst({ where: eq(members.id, member.id) }))!;
  return completeWelcome(db, fresh, await readWelcome(welcomeForm(fields)));
}

/** Fetches a Pennant's `file` the way a signed-in browser would. */
async function fetchAs(db: Db, viewer: Member | null, file: string): Promise<Response> {
  const [, , memberId, name] = file.split("/");
  return servePhoto({ db, currentMember: async () => viewer }, { memberId, file: name });
}

async function photoRows(db: Db) {
  return db.select({ memberId: memberPhotos.memberId }).from(memberPhotos);
}

describe("a photo pennant saved from the welcome form", () => {
  test("is stored, named by its hash, and served to any signed-in member at the URL it resolves to", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const photo = await jpeg();

    const saved = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo });

    const hash8 = createHash("sha256").update(photo).digest("hex").slice(0, 8);
    expect(saved.avatarId).toBe(`photo-${grandma.id}-${hash8}`);
    expect(saved.welcomedAt).not.toBeNull();
    const pennant = findAvatar(saved.avatarId)!;
    expect(pennant.kind).toBe("photo");
    expect(pennant.file).toBe(`/pennants/${grandma.id}/${hash8}.jpg`);

    const response = await fetchAs(db, jonah, pennant.file);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo);
  });

  test("keeping it posts back its own id: the name changes, the photo does not", async () => {
    const { db, grandma } = await seedWeek2();
    const first = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });

    const renamed = await save(db, grandma, { displayName: "Nana", avatarId: first.avatarId! });

    expect(renamed).toMatchObject({ displayName: "Nana", avatarId: first.avatarId });
    expect(await photoRows(db)).toEqual([{ memberId: grandma.id }]);
  });

  test("replacing it upserts the one row, and the old URL stops answering", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const first = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });
    const second = await save(db, grandma, {
      displayName: "Grandma",
      avatarId: "photo",
      photo: await jpeg({ seed: 3 }),
    });

    expect(second.avatarId).not.toBe(first.avatarId);
    expect(await photoRows(db)).toEqual([{ memberId: grandma.id }]);
    expect((await fetchAs(db, jonah, findAvatar(first.avatarId)!.file)).status).toBe(404);
    expect((await fetchAs(db, jonah, findAvatar(second.avatarId)!.file)).status).toBe(200);
  });

  test("switching to a flag or a logo deletes the row in the same save", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const photo = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });

    const flag = await save(db, grandma, { displayName: "Grandma", avatarId: "pennants-04" });

    expect(flag.avatarId).toBe("pennants-04");
    expect(await photoRows(db)).toEqual([]);
    expect((await fetchAs(db, jonah, findAvatar(photo.avatarId)!.file)).status).toBe(404);
  });

  test("a member with no photo still saves a flag as before", async () => {
    const { db, grandma } = await seedWeek2();
    expect((await save(db, grandma, { displayName: "Grandma", avatarId: "team-130" })).avatarId).toBe("team-130");
  });
});

describe("what the welcome form refuses", () => {
  async function refusal(fields: Parameters<typeof welcomeForm>[0], setup?: (db: Db, grandma: Member) => Promise<void>) {
    const { db, grandma } = await seedWeek2();
    await setup?.(db, grandma);
    const before = await db.query.members.findFirst({ where: eq(members.id, grandma.id) });
    const error = await save(db, grandma, fields).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InvalidWelcome);
    // Nothing is written on a refusal.
    expect(await db.query.members.findFirst({ where: eq(members.id, grandma.id) })).toEqual(before);
    return (error as InvalidWelcome).message;
  }

  test("a photo that is too large, not a JPEG, or not 216×216", async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(await jpeg());
    expect(await refusal({ displayName: "G", avatarId: "photo", photo: big })).toBe(
      "That photo is too large. Crop it again.",
    );
    expect(await refusal({ displayName: "G", avatarId: "photo", photo: await png() })).toBe(
      "That photo is not a JPEG. Crop it again.",
    );
    expect(await refusal({ displayName: "G", avatarId: "photo", photo: await jpeg({ width: 200 }) })).toBe(
      "That photo is 200×216, not 216×216. Crop it again.",
    );
  });

  test("`photo` with no file, and a file beside a flag", async () => {
    expect(await refusal({ displayName: "G", avatarId: "photo" })).toBe("Choose a photo first.");
    expect(await refusal({ displayName: "G", avatarId: "pennants-04", photo: await jpeg() })).toBe(
      "Pick a photo or a pennant, not both.",
    );
  });

  test("keeping a photo id that is not the member's current one, including someone else's", async () => {
    expect(await refusal({ displayName: "G", avatarId: "photo-1-0a1b2c3d" })).toBe("Pick one of the pennants.");
    let old = "";
    expect(
      await refusal({ displayName: "G", avatarId: "photo-2-00000000" }, async (db, grandma) => {
        old = (await save(db, grandma, { displayName: "G", avatarId: "photo", photo: await jpeg() })).avatarId!;
      }),
    ).toBe("Pick one of the pennants.");
    expect(old).toMatch(/^photo-\d+-[0-9a-f]{8}$/);
  });
});

describe("serving a photo", () => {
  test("needs a session, and a hash that matches the stored bytes", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const saved = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });
    const file = findAvatar(saved.avatarId)!.file;

    expect((await fetchAs(db, null, file)).status).toBe(401);
    expect((await fetchAs(db, jonah, `/pennants/${grandma.id}/00000000.jpg`)).status).toBe(404);
    expect((await fetchAs(db, jonah, `/pennants/${jonah.id}/${file.split("/")[3]}`)).status).toBe(404);
    expect((await fetchAs(db, jonah, `/pennants/x/${file.split("/")[3]}`)).status).toBe(404);
    expect((await fetchAs(db, jonah, `/pennants/${grandma.id}/${file.split("/")[3]}.png`)).status).toBe(404);
  });
});

describe("a photo's lifecycle outside the welcome form", () => {
  test("a commissioner clears it: the row goes and the member shows their initial", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });

    const cleared = await clearPhoto(db, jonah, grandma.id);

    expect(cleared.avatarId).toBeNull();
    expect(await photoRows(db)).toEqual([]);
  });

  test("clearing someone with no photo is refused", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await save(db, grandma, { displayName: "Grandma", avatarId: "pennants-04" });
    await expect(clearPhoto(db, jonah, grandma.id)).rejects.toThrow("Grandma has no photo.");
  });

  test("the console's clear answers the sentence and refreshes every screen that draws Pennants", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });
    const { route, revalidated } = routeFor(db, jonah, THURSDAY);

    expect(await clearMemberPhoto(route, form({ memberId: grandma.id }))).toEqual({
      done: "Grandma's photo is cleared.",
    });
    expect(revalidated).toContain("/leaderboard");
    expect(revalidated).toContain("/live");
    expect(revalidated).toContain("/you");
    expect(await clearMemberPhoto(route, form({ memberId: grandma.id }))).toEqual({
      error: "Grandma has no photo.",
    });
  });

  test("deactivating keeps it; deleting the member deletes it", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    const saved = await save(db, grandma, { displayName: "Grandma", avatarId: "photo", photo: await jpeg() });

    await setMemberActive(db, jonah, grandma.id, false);
    expect(await photoRows(db)).toEqual([{ memberId: grandma.id }]);
    expect((await db.query.members.findFirst({ where: eq(members.id, grandma.id) }))!.avatarId).toBe(saved.avatarId);

    await removeMember(db, jonah, grandma.id);
    expect(await photoRows(db)).toEqual([]);
  });
});

describe("reading a JPEG's size", () => {
  test("from a baseline or a progressive frame header", async () => {
    expect(jpegSize(await jpeg())).toEqual({ width: 216, height: 216 });
    expect(jpegSize(await jpeg({ width: 300, height: 120, progressive: true }))).toEqual({ width: 300, height: 120 });
    expect(photoProblem(await jpeg())).toBeNull();
  });

  test("not from anything else", async () => {
    expect(jpegSize(await png())).toBeNull();
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(jpegSize((await jpeg()).slice(0, 20))).toBeNull();
    expect(jpegSize(new Uint8Array())).toBeNull();
  });
});
