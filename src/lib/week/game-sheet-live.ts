import "server-only";
import type { Member } from "@/db/schema";
import { isCommissioner } from "@/lib/members/members";

/**
 * The `GAME_SHEET_LIVE` switch: whether a member sees the Game sheet's "On the
 * field" card. Decided in "How does the Game sheet ship behind a flag?" (#268):
 * `off`, `commissioners` or `everyone`, and an unset or unrecognised value is
 * `off`, so a missing variable fails safe. It gates the card and nothing else.
 *
 * A one-off rather than a framework: once it has sat at `everyone` for a
 * couple of Saturdays, a follow-up deletes it and the `off` path.
 */
export function showsFieldCard(member: Member, value: string | undefined): boolean {
  switch (value?.trim().toLowerCase()) {
    case "everyone":
      return true;
    case "commissioners":
      return isCommissioner(member);
    default:
      return false;
  }
}
