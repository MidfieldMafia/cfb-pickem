import { Check, ChevronDown } from "lucide-react";
import { switchGroup } from "@/app/(member)/actions";
import type { GroupChoice } from "@/lib/groups/current";

/**
 * The group name at the head of a board, and — for a member of two or more —
 * the control that moves between them.
 *
 * A server component on purpose. It needs no state, and the Live Board that
 * renders one is a `"use client"` file: reaching `groups/current.ts` from
 * inside that tree would pull a `server-only` module into the browser bundle
 * and fail the build. Rendered on the server and passed down, it cannot.
 *
 * `<details>` rather than a menu library, for the same reason the week chooser
 * is a row of plain links: it opens without JavaScript, it is a real disclosure
 * to a screen reader, and there is nothing to hydrate on a phone that is about
 * to spend its budget polling scores.
 */
export function GroupSwitcher({ choice }: { choice: GroupChoice }) {
  const others = choice.groups.filter((group) => group.id !== choice.current.id);

  // One group is not a choice. The name still heads the board, so a member who
  // has only ever been in one sees no control appear and nothing move.
  if (others.length === 0) {
    return <span className="truncate font-semibold">{choice.current.name}</span>;
  }

  return (
    <details className="group relative">
      {/* `min-h-tap`, not `tap`: globals.css gives the 44px floor to buttons and
          to `a.tap`, and a <summary> is neither — it measured 16px until this. */}
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-1 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="truncate">{choice.current.name}</span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        <span className="sr-only">Switch group</span>
      </summary>
      <form
        action={switchGroup}
        className="absolute left-0 z-20 mt-1 grid min-w-48 gap-0.5 rounded-md border border-border bg-card p-1 shadow-md"
      >
        <span className="flex min-h-tap items-center gap-2 rounded-sm px-2 text-sm font-semibold">
          <Check size={14} className="shrink-0 text-primary" aria-hidden />
          {choice.current.name}
        </span>
        {others.map((group) => (
          <button
            key={group.id}
            type="submit"
            name="groupId"
            value={group.id}
            className="flex min-h-tap items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent"
          >
            {/* Keeps the names aligned under the ticked one above. */}
            <span className="size-[14px] shrink-0" aria-hidden />
            {group.name}
          </button>
        ))}
      </form>
    </details>
  );
}
