import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import { showsFieldCard } from "./game-sheet-live";

const commissioner = { isCommissioner: true, active: true } as Member;
const member = { isCommissioner: false, active: true } as Member;
const inactiveCommissioner = { isCommissioner: true, active: false } as Member;

describe("showsFieldCard", () => {
  test("everyone shows it to every member", () => {
    expect(showsFieldCard(member, "everyone")).toBe(true);
    expect(showsFieldCard(commissioner, "everyone")).toBe(true);
  });

  test("commissioners shows it only to a commissioner in good standing", () => {
    expect(showsFieldCard(commissioner, "commissioners")).toBe(true);
    expect(showsFieldCard(member, "commissioners")).toBe(false);
    expect(showsFieldCard(inactiveCommissioner, "commissioners")).toBe(false);
  });

  test("off, unset and anything unrecognised show it to nobody", () => {
    for (const value of ["off", undefined, "", "on", "true", "commissioner"]) {
      expect(showsFieldCard(commissioner, value)).toBe(false);
    }
  });

  test("forgives case and stray whitespace", () => {
    expect(showsFieldCard(member, " Everyone\n")).toBe(true);
  });
});
