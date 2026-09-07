"use client";

/**
 * A candidate's place on the Slate, as the checkbox the mockups ask for: on
 * means the Game is on the Slate. Ticking it submits the form it sits in —
 * `addGameAction` or `removeGameAction`, whichever the row handed it — so the
 * gesture is one click rather than a button press.
 *
 * The box is 20px inside a 44px target, which is the tap minimum the design
 * notes set; `min-h-0` is what stops the base layer stretching the box itself
 * to 44px. The submit button behind it keeps the row working without
 * JavaScript, and gives the keyboard a way to commit the change.
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
      <label className="flex size-tap items-center justify-center">
        <input
          type="checkbox"
          // Remounts when the slate moves under it, so the box matches the row.
          key={String(checked)}
          defaultChecked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="size-5 min-h-0 accent-primary disabled:opacity-50"
        />
      </label>
      <button type="submit" className="sr-only" disabled={disabled}>
        {label}
      </button>
    </>
  );
}
