import { describe, expect, test } from "vitest";
import { createTestDb } from "@/test/db";
import { bootstrapCommissioner } from "./members";
import { exchangeToken, getSession, completeWelcome } from "./auth";

describe("magic link sign-in", () => {
  test("opening a magic link signs the member in", async () => {
    const db = await createTestDb();
    const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });

    const signIn = await exchangeToken(db, jonah.token);

    expect(signIn).not.toBeNull();
    const current = await getSession(db, signIn!.sessionId);
    expect(current?.displayName).toBe("Jonah");
  });

  test("an unknown token is refused", async () => {
    const db = await createTestDb();
    await bootstrapCommissioner(db, { displayName: "Jonah" });

    expect(await exchangeToken(db, "not-a-real-token")).toBeNull();
  });

  test("a session id nobody issued is refused", async () => {
    const db = await createTestDb();

    expect(await getSession(db, "made-up-session")).toBeNull();
  });

  test("the first visit lands on welcome; after the welcome page it lands on the week", async () => {
    const db = await createTestDb();
    const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });

    const first = await exchangeToken(db, jonah.token);
    expect(first?.landing).toBe("welcome");

    await completeWelcome(db, first!.member, { displayName: "Jonah M", avatarId: "pennants-01" });

    const second = await exchangeToken(db, jonah.token);
    expect(second?.landing).toBe("week");
    expect(second?.member.displayName).toBe("Jonah M");
    expect(second?.member.avatarId).toBe("pennants-01");
  });
});
