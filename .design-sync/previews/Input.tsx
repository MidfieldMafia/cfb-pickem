import { Input } from "@saturday-slate/design-system";

const stack = { display: "grid", gap: 12, padding: 16, maxWidth: 390 } as const;

export function Default() {
  return (
    <div style={stack}>
      <Input placeholder="Your name" aria-label="Your name" />
      <Input placeholder="Tiebreaker Guess (total points)" inputMode="numeric" aria-label="Tiebreaker Guess" />
    </div>
  );
}

export function Filled() {
  return (
    <div style={stack}>
      <Input defaultValue="Alex Mabry" aria-label="Display name" />
    </div>
  );
}

export function Invalid() {
  return (
    <div style={stack}>
      <Input defaultValue="abc" aria-invalid="true" aria-label="Tiebreaker Guess" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={stack}>
      <Input defaultValue="Picks are locked" disabled aria-label="Locked" />
    </div>
  );
}
