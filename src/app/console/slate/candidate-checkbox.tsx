"use client";

import { Checkbox } from "@saturday-slate/design-system";

/**
 * A candidate's place on the Slate, as a checkbox: on means the Game is on the
 * Slate. Ticking it submits the form it sits in —
 * `addGameAction` or `removeGameAction`, whichever the row handed it — so the
 * gesture is one click rather than a button press.
 *
 * The submit button behind it keeps the row working without JavaScript, and
 * gives the keyboard a way to commit the change.
 */
export function CandidateCheckbox({
  checked,
  disabled,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <>
      <Checkbox
        // Remounts when the slate moves under it, so the box matches the row.
        key={String(checked)}
        defaultChecked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <button type="submit" className="sr-only" disabled={disabled}>
        {label}
      </button>
    </>
  );
}
