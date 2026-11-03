/** Reserving a push before it is sent (#529): the second try at the same key conflicts and sends nothing. */
import { describe, expect, test } from "vitest";
import { createTestDb } from "@/test/db";
import { pushKey, release, reserve } from "./reservations";

describe("a push reservation", () => {
  test("is held by the first try; a second at the same key is refused, and a different key is not", async () => {
    const db = await createTestDb();
    expect(await reserve(db, pushKey.reminder(7, 3))).toBe(true);
    expect(await reserve(db, pushKey.reminder(7, 3))).toBe(false);
    expect(await reserve(db, pushKey.reminder(7, 4))).toBe(true);
  });

  test("released after a send nothing took, it can be reserved again", async () => {
    const db = await createTestDb();
    await reserve(db, pushKey.close(12));
    await release(db, pushKey.close(12));
    expect(await reserve(db, pushKey.close(12))).toBe(true);
  });

  test("keys name the push and what makes it one of a kind (#493)", () => {
    expect([
      pushKey.reminder(7, 3),
      pushKey.chat(55, 3),
      pushKey.mention(55, 3),
      pushKey.close(12),
      pushKey.win(7, 2),
      pushKey.feedback(9),
    ]).toEqual(["reminder:7:3", "chat:55:3", "mention:55:3", "close:12", "win:7:2", "feedback:9"]);
  });
});
