import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { seedWeek2 } from "@/test/week-2";
import { inOneBatch } from "./batch";
import { memberPhotos, members } from "./schema";

describe("writes in one batch", () => {
  test("all land or none do: a failing second write takes the first back with it", async () => {
    const { db, grandma } = await seedWeek2();

    const failed = inOneBatch(db, (tx) => [
      tx.update(members).set({ avatarId: "photo-2-0a1b2c3d" }).where(eq(members.id, grandma.id)),
      // No member 9999, so the foreign key refuses this row.
      tx.insert(memberPhotos).values({ memberId: 9999, bytes: "" }),
    ]);

    await expect(failed).rejects.toThrow();
    expect((await db.query.members.findFirst({ where: eq(members.id, grandma.id) }))!.avatarId).toBe(grandma.avatarId);
  });

  test("answers each write's result, in order", async () => {
    const { db, grandma } = await seedWeek2();
    const [, [updated]] = await inOneBatch(db, (tx) => [
      tx.insert(memberPhotos).values({ memberId: grandma.id, bytes: "" }),
      tx.update(members).set({ avatarId: "pennants-04" }).where(eq(members.id, grandma.id)).returning(),
    ]);
    expect(updated.avatarId).toBe("pennants-04");
  });
});
