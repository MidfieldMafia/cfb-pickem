import { Check } from "lucide-react";
import { switchGroup } from "@/app/(member)/actions";
import type { GroupChoice } from "@/lib/groups/current";

/**
 * The group a board belongs to, and — for a member of two or more — the
 * control that moves between them. It lives in the member menu, open by the
 * time it is visible, so it is a flat list rather than a disclosure of its own.
 *
 * A server component on purpose. It needs no state, and the Live Board that
 * renders one is a `"use client"` file: reaching `groups/current.ts` from
 * inside that tree would pull a `server-only` module into the browser bundle
 * and fail the build. Rendered on the server and passed down, it cannot.
 */
export function GroupSwitcher({ choice }: { choice: GroupChoice }) {
  const others = choice.groups.filter((group) => group.id !== choice.current.id);

  // One group is not a choice. The name is still shown, so a member who has
  // only ever been in one sees no control appear.
  if (others.length === 0) {
    return <span className="flex min-h-tap items-center text-sm font-semibold">{choice.current.name}</span>;
  }

  return (
    <form action={switchGroup} className="grid gap-0.5">
      <span className="flex min-h-tap items-center gap-2 text-sm font-semibold">
        <Check size={14} className="shrink-0 text-primary" aria-hidden />
        {choice.current.name}
      </span>
      {others.map((group) => (
        <button
          key={group.id}
          type="submit"
          name="groupId"
          value={group.id}
          className="flex min-h-tap items-center gap-2 rounded-sm text-left text-sm hover:bg-accent"
        >
          {/* Keeps the names aligned under the ticked one above. */}
          <span className="size-[14px] shrink-0" aria-hidden />
          {group.name}
        </button>
      ))}
    </form>
  );
}
