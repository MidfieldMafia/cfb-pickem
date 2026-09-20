import { Progress } from "@saturday-slate/design-system";

const stack = { display: "grid", gap: 16, padding: 16, maxWidth: 390 } as const;
const label = { fontSize: 12, lineHeight: "16px", marginBottom: 6, color: "var(--muted-foreground)" } as const;

export function Levels() {
  return (
    <div style={stack}>
      <div><div style={label}>Games picked · 3 of 10</div><Progress value={30} aria-label="Games picked" /></div>
      <div><div style={label}>Members in · 7 of 10</div><Progress value={70} aria-label="Members in" /></div>
      <div><div style={label}>Slate complete</div><Progress value={100} aria-label="Slate complete" /></div>
    </div>
  );
}

export function Empty() {
  return (
    <div style={stack}>
      <div><div style={label}>No picks yet</div><Progress value={0} aria-label="No picks yet" /></div>
    </div>
  );
}
